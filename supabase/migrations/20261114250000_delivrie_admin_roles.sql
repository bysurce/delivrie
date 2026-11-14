-- Platform admin roles.
--   owner:  everything, including adding and removing admins
--   admin:  everything except managing admins (plans, credits, pausing sending, support, website settings)
--   viewer: read-only oversight of usage: overview, users, teams, revenue and sending health
-- Existing platform admins become owners.

alter table public.platform_admins add column if not exists role text not null default 'owner';
alter table public.platform_admins alter column role set default 'viewer';
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check check (role in ('owner', 'admin', 'viewer'));
alter table public.platform_admins add column if not exists added_by uuid;

-- The signed-in user's platform role, or null.
create or replace function public.platform_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.platform_admins where user_id = auth.uid();
$$;
revoke execute on function public.platform_role() from public, anon;
grant execute on function public.platform_role() to authenticated;

-- Replace the old admin_guard() with admin_guard(min) (an overload would make admin_guard() ambiguous).
drop function if exists public.admin_guard();
-- admin_guard(min): raises unless the caller's role is at least `min` (viewer < admin < owner).
create or replace function public.admin_guard(p_min text default 'viewer') returns void
language plpgsql stable security definer set search_path = public as $$
declare r text := public.platform_role();
begin
  if r is null then raise exception 'Not a platform admin' using errcode = '42501'; end if;
  if (case r when 'owner' then 3 when 'admin' then 2 else 1 end) < (case p_min when 'owner' then 3 when 'admin' then 2 else 1 end) then
    raise exception 'Your admin role (%) can''t do this. Ask an owner.', r using errcode = '42501';
  end if;
end $$;
revoke execute on function public.admin_guard(text) from public, anon;
grant execute on function public.admin_guard(text) to authenticated;

-- Changing things needs the admin role; reading stays open to viewers. Rewrites each function's guard in place.
do $$
declare f text; d text;
begin
  foreach f in array array['admin_set_plan', 'admin_grant_credits', 'admin_set_sending_paused', 'admin_site_set', 'admin_site_get', 'admin_inbox'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f;
    if d is not null and position('perform public.admin_guard()' in d) > 0 then
      execute replace(d, 'perform public.admin_guard()', 'perform public.admin_guard(''admin'')');
    end if;
  end loop;
end $$;

-- Managing admins (owners only). New admins must already have a Delivrie account.
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
     order by case a.role when 'owner' then 0 when 'admin' then 1 else 2 end, a.created_at;
end $$;

create or replace function public.admin_add_admin(p_email text, p_role text default 'viewer') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.admin_guard('owner');
  if p_role not in ('owner', 'admin', 'viewer') then raise exception 'Role must be owner, admin or viewer'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then raise exception 'No Delivrie account uses %. Ask them to sign up first, then add them.', trim(p_email); end if;
  insert into public.platform_admins (user_id, role, added_by) values (uid, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
end $$;

create or replace function public.admin_set_admin_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('owner');
  if p_role not in ('owner', 'admin', 'viewer') then raise exception 'Role must be owner, admin or viewer'; end if;
  if p_role <> 'owner' and (select role from public.platform_admins where user_id = p_user) = 'owner'
     and (select count(*) from public.platform_admins where role = 'owner') <= 1 then
    raise exception 'There must always be at least one owner';
  end if;
  update public.platform_admins set role = p_role where user_id = p_user;
end $$;

create or replace function public.admin_remove_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('owner');
  if (select role from public.platform_admins where user_id = p_user) = 'owner'
     and (select count(*) from public.platform_admins where role = 'owner') <= 1 then
    raise exception 'There must always be at least one owner';
  end if;
  delete from public.platform_admins where user_id = p_user;
end $$;

revoke execute on function public.admin_list_admins(), public.admin_add_admin(text, text), public.admin_set_admin_role(uuid, text), public.admin_remove_admin(uuid) from public, anon;
grant execute on function public.admin_list_admins(), public.admin_add_admin(text, text), public.admin_set_admin_role(uuid, text), public.admin_remove_admin(uuid) to authenticated;
