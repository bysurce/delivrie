-- Audit log: who changed what in a team, and when (an Enterprise feature; recorded for every team so the history is
-- there on upgrade).
--
-- Two writers, never both for the same change:
--   - The API (edge function) records changes made through it: by a dashboard user, an API key or a connected app.
--   - The triggers below record changes the dashboard makes directly in the database, which run as the signed-in
--     user (auth.uid() is set). Writes made by the edge function run as the service role, where auth.uid() is null,
--     so the triggers skip them.
--   - Sign-ins are recorded from auth.users.last_sign_in_at, for each team the user belongs to.

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'api_key', 'app', 'system')),
  actor_id text,
  actor_label text,
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text
);
create index if not exists audit_logs_team_time on public.audit_logs (team_id, created_at desc);
create index if not exists audit_logs_team_action on public.audit_logs (team_id, action, created_at desc);

alter table public.audit_logs enable row level security;
-- Team admins on the Enterprise plan can read their team's log. Nobody can change or delete entries through the API.
drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using (public.is_team_admin(team_id) and exists (select 1 from public.teams t where t.id = team_id and t.plan_transactional = 'enterprise'));
revoke insert, update, delete on public.audit_logs from anon, authenticated;

-- Writes one entry for the signed-in user. Used by the triggers.
create or replace function public.audit_write(p_team uuid, p_action text, p_target_type text, p_target_id text, p_target_label text, p_meta jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); who text;
begin
  if uid is null or p_team is null then return; end if;
  select email into who from auth.users where id = uid;
  insert into public.audit_logs (team_id, actor_type, actor_id, actor_label, action, target_type, target_id, target_label, metadata, user_agent)
  values (p_team, 'user', uid::text, who, p_action, p_target_type, p_target_id, p_target_label, coalesce(p_meta, '{}'::jsonb), 'Dashboard');
end $$;
revoke all on function public.audit_write(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  t text := tg_table_name;
  r jsonb := to_jsonb(coalesce(new, old));
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  team uuid := case when t = 'teams' then (r->>'id')::uuid else (r->>'team_id')::uuid end;
  verb text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  changed text[];
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into changed from jsonb_object_keys(r) k
     where k not in ('updated_at', 'last_used_at', 'last_checked_at', 'access_hash', 'refresh_hash', 'access_expires_at', 'signing_secret', 'certificate', 'key_hash') and r->k is distinct from o->k;
    if changed is null then return new; end if;
  end if;

  if t = 'team_members' then
    perform public.audit_write(team, case tg_op when 'INSERT' then 'member.added' when 'DELETE' then 'member.removed' else 'member.role_changed' end,
      'member', r->>'user_id', (select email from auth.users where id = (r->>'user_id')::uuid),
      case when tg_op = 'UPDATE' then jsonb_build_object('from', o->>'role', 'to', r->>'role') else jsonb_build_object('role', r->>'role') end);
  elsif t = 'team_invites' then
    perform public.audit_write(team, case tg_op when 'INSERT' then 'invite.sent' when 'DELETE' then 'invite.revoked' else 'invite.updated' end,
      'invite', r->>'id', r->>'email', jsonb_build_object('role', r->>'role') || case when changed is not null then jsonb_build_object('changed', to_jsonb(changed)) else '{}'::jsonb end);
  elsif t = 'api_keys' then
    perform public.audit_write(team, 'api_key.' || verb, 'api_key', r->>'id', coalesce(r->>'name', r->>'prefix'),
      jsonb_build_object('permission', r->>'permission', 'prefix', r->>'prefix') || case when changed is not null then jsonb_build_object('changed', to_jsonb(changed)) else '{}'::jsonb end);
  elsif t = 'webhooks' then
    perform public.audit_write(team, 'webhook.' || verb, 'webhook', r->>'id', r->>'endpoint',
      case when changed is not null then jsonb_build_object('changed', to_jsonb(changed)) else '{}'::jsonb end);
  elsif t = 'domains' then
    perform public.audit_write(team, 'domain.' || verb, 'domain', r->>'id', r->>'name',
      case when changed is not null then jsonb_build_object('changed', to_jsonb(changed)) else '{}'::jsonb end);
  elsif t = 'sso_configs' then
    perform public.audit_write(team, 'sso.' || verb, 'sso', r->>'team_id', coalesce(r->>'provider', 'SAML'),
      jsonb_build_object('enforce', r->'enforce') || case when changed is not null then jsonb_build_object('changed', to_jsonb(changed)) else '{}'::jsonb end);
  elsif t = 'oauth_grants' then
    perform public.audit_write(team, case when tg_op = 'INSERT' then 'connected_app.authorized'
        when tg_op = 'DELETE' or (r->>'revoked_at' is not null and o->>'revoked_at' is null) then 'connected_app.revoked' else 'connected_app.updated' end,
      'connected_app', r->>'id', (select c.name from public.oauth_clients c where c.id::text = r->>'client_id'), jsonb_build_object('scopes', r->'scopes'));
  elsif t = 'teams' then
    if tg_op <> 'UPDATE' then return coalesce(new, old); end if;
    -- Only settings people change; plan, credits and billing changes are recorded by the billing service.
    select array_agg(x) into changed from unnest(changed) x where x in ('name', 'brand', 'unsubscribe_page', 'avatar_url', 'integrations');
    if changed is null then return new; end if;
    perform public.audit_write(team, 'team.updated', 'team', r->>'id', r->>'name', jsonb_build_object('changed', to_jsonb(changed)));
  elsif t = 'suppressions' then
    if tg_op <> 'DELETE' then return coalesce(new, old); end if;
    perform public.audit_write(team, 'suppression.removed', 'suppression', r->>'id', r->>'email', jsonb_build_object('reason', r->>'reason'));
  elsif t = 'templates' then
    if tg_op <> 'DELETE' then return coalesce(new, old); end if;
    perform public.audit_write(team, 'template.deleted', 'template', r->>'id', r->>'name', '{}'::jsonb);
  elsif t = 'automations' then
    if tg_op = 'UPDATE' and not ('status' = any(changed)) then return new; end if;
    perform public.audit_write(team, case when tg_op = 'UPDATE' then 'automation.' || coalesce(r->>'status', 'updated') else 'automation.' || verb end,
      'automation', r->>'id', r->>'name', case when tg_op = 'UPDATE' then jsonb_build_object('from', o->>'status', 'to', r->>'status') else '{}'::jsonb end);
  end if;
  return coalesce(new, old);
-- Never let a problem writing the log block the change itself.
exception when others then
  raise warning 'audit_row %: %', t, sqlerrm;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['team_members', 'team_invites', 'api_keys', 'webhooks', 'domains', 'sso_configs', 'oauth_grants', 'teams', 'suppressions', 'templates', 'automations'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Sign-ins: Supabase updates last_sign_in_at on every sign-in (password, code, Google, GitHub, SSO).
create or replace function public.audit_sign_in() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    insert into public.audit_logs (team_id, actor_type, actor_id, actor_label, action, target_type, target_id, target_label, metadata)
    select m.team_id, 'user', new.id::text, new.email, 'user.signed_in', 'user', new.id::text, new.email,
           jsonb_build_object('provider', coalesce(new.raw_app_meta_data->>'provider', 'email'))
      from public.team_members m where m.user_id = new.id;
  end if;
  return new;
-- A sign-in must never fail because the log couldn't be written.
exception when others then
  raise warning 'audit_sign_in: %', sqlerrm;
  return new;
end $$;
drop trigger if exists audit_sign_in on auth.users;
create trigger audit_sign_in after update of last_sign_in_at on auth.users for each row execute function public.audit_sign_in();
