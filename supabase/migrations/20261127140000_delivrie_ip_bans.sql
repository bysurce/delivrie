-- IP blocks for banned accounts.
--
-- account_ips: the addresses each person uses the dashboard from, recorded by the API (throttled) so they're still
--   known after sessions end. Kept 180 days.
-- blocked_ips: addresses that can't use the API or dashboard API, or sign up. Filled automatically when an account is
--   banned (auth.users.banned_until set in the future, from Admin or anywhere else) and cleared when it's unbanned.
--   Each block lasts 90 days: mobile networks share and reuse addresses, so a permanent block would end up hitting
--   other people.
-- Never blocked automatically: addresses also used by a platform admin or by a member of a paying team.

create table if not exists public.account_ips (
  user_id uuid,
  team_id uuid,
  ip text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create unique index if not exists account_ips_key on public.account_ips (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), ip);
create index if not exists account_ips_ip on public.account_ips (ip);
create index if not exists account_ips_user on public.account_ips (user_id);
alter table public.account_ips enable row level security;

create table if not exists public.blocked_ips (
  ip text primary key,
  reason text,
  user_id uuid,
  user_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.blocked_ips enable row level security;

-- Called by the API (service role) for dashboard requests, at most hourly per person and address.
create or replace function public.note_ip(p_user uuid, p_team uuid, p_ip text) returns void
language sql security definer set search_path = public as $$
  insert into public.account_ips (user_id, team_id, ip) values (p_user, p_team, left(p_ip, 64))
  on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), ip)
  do update set last_seen = now();
  delete from public.account_ips where last_seen < now() - interval '180 days' and random() < 0.01;
$$;
revoke all on function public.note_ip(uuid, uuid, text) from public, anon, authenticated;

-- Every address a person is known to have used from their own browser: dashboard requests, dashboard changes in the
-- audit log and current sessions. Addresses of API-key and connected-app requests are left out on purpose: those come
-- from servers (hosting providers, AI assistants) that many other customers share.
create or replace function public.ips_of_user(p_user uuid) returns setof text
language sql stable security definer set search_path = public, auth as $$
  select distinct ip from (
    select ip from public.account_ips where user_id = p_user
    union all
    select ip from public.audit_logs where actor_id = p_user::text and actor_type = 'user' and user_agent = 'Dashboard' and ip is not null
    union all
    select host(s.ip) from auth.sessions s where s.user_id = p_user and s.ip is not null
  ) x where ip is not null and ip <> '';
$$;
revoke all on function public.ips_of_user(uuid) from public, anon, authenticated;

create or replace function public.block_user_ips(p_user uuid, p_email text, p_reason text) returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  insert into public.blocked_ips (ip, reason, user_id, user_email, expires_at)
  select ip, coalesce(p_reason, 'Account banned'), p_user, p_email, now() + interval '90 days'
    from public.ips_of_user(p_user) ip
   where not exists (  -- shared with a platform admin or a paying customer: leave it open
     select 1 from public.account_ips a
      where a.ip = ip.ip and a.user_id is distinct from p_user and (
        a.user_id in (select user_id from public.platform_admins)
        or a.team_id in (select id from public.teams where coalesce(plan_transactional, 'free') <> 'free')
        or a.user_id in (select m.user_id from public.team_members m join public.teams t on t.id = m.team_id where coalesce(t.plan_transactional, 'free') <> 'free')))
  on conflict (ip) do update set expires_at = excluded.expires_at, reason = excluded.reason, user_id = excluded.user_id, user_email = excluded.user_email;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.block_user_ips(uuid, text, text) from public, anon, authenticated;

-- Banning an account (banned_until in the future) blocks its addresses; lifting the ban lifts them.
create or replace function public.on_user_ban() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.banned_until is not null and new.banned_until > now() and (old.banned_until is null or old.banned_until <= now()) then
    perform public.block_user_ips(new.id, new.email, 'Account banned');
  elsif (new.banned_until is null or new.banned_until <= now()) and old.banned_until is not null and old.banned_until > now() then
    delete from public.blocked_ips where user_id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'on_user_ban: %', sqlerrm;
  return new;
end $$;
revoke all on function public.on_user_ban() from public, anon, authenticated;
drop trigger if exists on_user_ban on auth.users;
create trigger on_user_ban after update of banned_until on auth.users for each row execute function public.on_user_ban();

-- Sign-ups from a blocked address are refused. Supabase Auth calls this before creating a user once it's turned on
-- under Authentication -> Hooks -> "Before User Created" (Postgres function public.hook_before_user_created).
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ip text := trim(split_part(coalesce(event->'metadata'->>'ip_address', ''), ',', 1));
begin
  if v_ip <> '' and exists (select 1 from public.blocked_ips b where b.ip = v_ip and (b.expires_at is null or b.expires_at > now())) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign-ups from this network are blocked. Contact support@delivrie.io if you think this is a mistake.'));
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on public.blocked_ips to supabase_auth_admin;

-- Admin: ban or unban an account, list and lift IP blocks.
create or replace function public.admin_ban_user(p_user uuid, p_banned boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare blocked int := 0; who text;
begin
  perform public.admin_guard('admin');
  if p_user = auth.uid() then raise exception 'You can''t ban yourself'; end if;
  if exists (select 1 from public.platform_admins where user_id = p_user) then raise exception 'Remove their admin access first'; end if;
  select email into who from auth.users where id = p_user;
  if who is null then raise exception 'User not found'; end if;
  if p_banned then
    blocked := public.block_user_ips(p_user, who, coalesce(nullif(trim(p_reason), ''), 'Account banned'));
    update auth.users set banned_until = '2999-01-01' where id = p_user;
    delete from auth.sessions where user_id = p_user;
    delete from auth.refresh_tokens where user_id = p_user::text;
    -- Teams they run alone stop sending; shared teams carry on for the other members.
    update public.teams t set sending_paused_at = now(), sending_paused_reason = coalesce(nullif(trim(p_reason), ''), 'Account banned')
     where t.id in (select m.team_id from public.team_members m where m.user_id = p_user)
       and not exists (select 1 from public.team_members o where o.team_id = t.id and o.user_id <> p_user);
  else
    update auth.users set banned_until = null where id = p_user;
    delete from public.blocked_ips where user_id = p_user;
  end if;
  return jsonb_build_object('banned', p_banned, 'ips_blocked', (select count(*) from public.blocked_ips where user_id = p_user));
end $$;
revoke all on function public.admin_ban_user(uuid, boolean, text) from public, anon;
grant execute on function public.admin_ban_user(uuid, boolean, text) to authenticated;

create or replace function public.admin_blocked_ips() returns table(ip text, reason text, user_email text, created_at timestamptz, expires_at timestamptz, other_accounts bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin');
  return query select b.ip, b.reason, b.user_email, b.created_at, b.expires_at,
    (select count(distinct a.user_id) from public.account_ips a where a.ip = b.ip and a.user_id is distinct from b.user_id)
    from public.blocked_ips b where b.expires_at is null or b.expires_at > now() order by b.created_at desc limit 500;
end $$;
revoke all on function public.admin_blocked_ips() from public, anon;
grant execute on function public.admin_blocked_ips() to authenticated;

create or replace function public.admin_unblock_ip(p_ip text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin');
  delete from public.blocked_ips where ip = p_ip;
end $$;
revoke all on function public.admin_unblock_ip(text) from public, anon;
grant execute on function public.admin_unblock_ip(text) to authenticated;

create or replace function public.admin_banned_users(p_ids uuid[]) returns setof uuid
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.admin_guard('viewer');
  return query select id from auth.users where id = any(p_ids) and banned_until > now();
end $$;
revoke all on function public.admin_banned_users(uuid[]) from public, anon;
grant execute on function public.admin_banned_users(uuid[]) to authenticated;
