-- Support team: a "support" platform role (Admin → Support only), accepting conversations, and a leaderboard.
--   support: answers customers in Admin → Support and sees the leaderboard; nothing else in the admin area.
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check check (role in ('owner', 'admin', 'viewer', 'support'));

-- Support people don't pass the viewer guard: they can't read usage, users, teams or revenue.
create or replace function public.admin_guard(p_min text default 'viewer') returns void
language plpgsql stable security definer set search_path = public as $$
declare r text := public.platform_role();
begin
  if r is null then raise exception 'Not a platform admin' using errcode = '42501'; end if;
  if (case r when 'owner' then 3 when 'admin' then 2 when 'viewer' then 1 else 0 end) < (case p_min when 'owner' then 3 when 'admin' then 2 else 1 end) then
    raise exception 'Your admin role (%) can''t do this. Ask an owner.', r using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz, added_by_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('owner');
  return query
    select a.user_id, u.email::text, p.full_name, a.role, a.created_at, ab.email::text
      from public.platform_admins a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = a.user_id
      left join auth.users ab on ab.id = a.added_by
     order by case a.role when 'owner' then 0 when 'admin' then 1 when 'support' then 2 else 3 end, a.created_at;
end $$;

create or replace function public.admin_add_admin(p_email text, p_role text default 'viewer') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.admin_guard('owner');
  if p_role not in ('owner', 'admin', 'viewer', 'support') then raise exception 'Role must be owner, admin, support or viewer'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then raise exception 'No Delivrie account uses %. Ask them to sign up first, then add them.', trim(p_email); end if;
  insert into public.platform_admins (user_id, role, added_by) values (uid, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
end $$;

create or replace function public.admin_set_admin_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('owner');
  if p_role not in ('owner', 'admin', 'viewer', 'support') then raise exception 'Role must be owner, admin, support or viewer'; end if;
  if p_role <> 'owner' and (select role from public.platform_admins where user_id = p_user) = 'owner'
     and (select count(*) from public.platform_admins where role = 'owner') <= 1 then
    raise exception 'There must always be at least one owner';
  end if;
  update public.platform_admins set role = p_role where user_id = p_user;
end $$;

-- Who accepted a conversation, when the first reply went out, and who resolved it (for the leaderboard).
alter table public.support_threads
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_by_name text,
  add column if not exists accepted_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists first_response_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by_id uuid references auth.users(id) on delete set null;
create index if not exists support_threads_accepted on public.support_threads(accepted_by, accepted_at desc) where accepted_by is not null;
create index if not exists support_threads_escalated on public.support_threads(escalated_at desc) where escalated_at is not null;

-- Existing conversations: whoever was answering counts as having accepted them.
update public.support_threads t set accepted_by = t.assignee_id, accepted_by_name = t.assignee_name, accepted_at = coalesce(t.accepted_at, t.escalated_at)
 where t.accepted_by is null and t.assignee_id is not null;
update public.support_threads t set first_response_at = m.created_at, first_response_by = m.user_id
  from (select distinct on (thread_id) thread_id, created_at, user_id from public.support_messages where author = 'support' order by thread_id, created_at) m
 where m.thread_id = t.id and t.first_response_at is null;
