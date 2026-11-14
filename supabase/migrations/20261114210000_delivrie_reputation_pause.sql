-- Automatic sending pause to protect our shared sending reputation (as described to AWS for SES production access).
-- The delivrie function's cron checks every team once an hour (see reputationWatch in index.ts):
--   bounce rate above 4% with at least 100 emails in the last 7 days, or
--   complaint rate above 0.08% with at least 1,000 emails in the last 7 days.
-- A paused team can't send (the API returns 403 sending_paused) until a platform admin resumes it.
-- Customers can't change these columns: authenticated users only have UPDATE on a few team columns.

alter table public.teams add column if not exists sending_paused_at timestamptz;
alter table public.teams add column if not exists sending_paused_reason text;

-- Per-team delivery outcomes over the last p_days, for teams that are sending. Test addresses (the SES mailbox
-- simulator) and our own system emails are left out, and so are emails that never left (queued, scheduled,
-- canceled, suppressed, failed).
create or replace function public.reputation_stats(p_days int default 7)
returns table (team_id uuid, sent bigint, bounced bigint, complained bigint)
language sql stable security definer set search_path = public as $$
  select e.team_id,
         count(*) as sent,
         count(*) filter (where e.status = 'bounced') as bounced,
         count(*) filter (where e.status = 'complained') as complained
    from public.emails e
   where e.direction = 'outbound'
     and e.created_at >= now() - make_interval(days => p_days)
     and e.status in ('sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained')
     and not (e.tags @> '[{"name":"system"}]'::jsonb)
     and not (array_to_string(e."to", ',') ilike '%@test.delivrie.io%')
   group by e.team_id
$$;
revoke execute on function public.reputation_stats(int) from public, anon, authenticated;

-- Platform admins: pause or resume a team's sending.
create or replace function public.admin_set_sending_paused(p_team uuid, p_paused boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  update public.teams
     set sending_paused_at = case when p_paused then now() else null end,
         sending_paused_reason = case when p_paused then coalesce(nullif(trim(p_reason), ''), 'Paused by Delivrie support') else null end
   where id = p_team;
end $$;
revoke execute on function public.admin_set_sending_paused(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_sending_paused(uuid, boolean, text) to authenticated;

-- Platform admins: which teams are paused, and why, with their recent rates.
create or replace function public.admin_paused_teams()
returns table (id uuid, sending_paused_at timestamptz, sending_paused_reason text)
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query select t.id, t.sending_paused_at, t.sending_paused_reason from public.teams t where t.sending_paused_at is not null;
end $$;
revoke execute on function public.admin_paused_teams() from public, anon;
grant execute on function public.admin_paused_teams() to authenticated;
