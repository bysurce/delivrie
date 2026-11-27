-- Deliverability guards: keep mail that can't be delivered away from Amazon SES, and stop bad senders fast.
-- See hygiene.ts (recipient screening) and the bounce breaker in index.ts.

-- Addresses that hard-bounced or complained for any team are skipped for every team. (The per-team suppressions
-- list still works as before; this one sits on top.)
create table if not exists public.global_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounce', 'complaint')),
  team_id uuid,
  created_at timestamptz not null default now()
);
alter table public.global_suppressions enable row level security;
insert into public.global_suppressions (email, reason, team_id, created_at)
select distinct on (lower(email)) lower(email), reason, team_id, created_at
  from public.suppressions
 where reason in ('bounce', 'complaint') and email not ilike '%@simulator.amazonses.com' and email not ilike '%@test.delivrie.io'
 order by lower(email), created_at
on conflict (email) do nothing;

-- Whether a recipient domain can receive email (has MX, or an A/AAAA record as the implicit mail server), cached.
create table if not exists public.recipient_domains (
  domain text primary key,
  accepts boolean not null,
  detail text,
  checked_at timestamptz not null default now()
);
alter table public.recipient_domains enable row level security;

-- A real hard bounce: SES said Permanent, and not because the address was already on a suppression list (those
-- aren't delivery attempts and don't count against sending reputation).
create or replace function public.is_hard_bounce(p_email uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.email_events v where v.email_id = p_email and v.type = 'bounced'
    and coalesce(v.data->>'type', '') = 'Permanent' and coalesce(v.data->>'sub_type', '') not in ('OnAccountSuppressionList', 'OnSuppressionList'));
$$;

-- Sends that count for reputation: outbound, delivered or attempted, not our own notices, not test addresses.
create or replace function public.reputation_stats(p_days integer default 7)
returns table(team_id uuid, sent bigint, bounced bigint, complained bigint)
language sql stable security definer set search_path = public as $$
  select e.team_id, count(*),
         count(*) filter (where e.status = 'bounced' and public.is_hard_bounce(e.id)),
         count(*) filter (where e.status = 'complained')
    from public.emails e
   where e.direction = 'outbound' and e.created_at >= now() - make_interval(days => p_days)
     and e.status in ('sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained')
     and not (e.tags @> '[{"name":"system"}]'::jsonb)
     and not (array_to_string(e."to", ',') ilike '%@test.delivrie.io%')
   group by e.team_id
$$;

-- A team's last p_n such sends in the past 7 days, and how many hard-bounced. For the bounce breaker.
create or replace function public.team_recent_bounces(p_team uuid, p_n integer default 50)
returns table(sent bigint, bounced bigint)
language sql stable security definer set search_path = public as $$
  with recent as (
    select e.id, e.status from public.emails e
     where e.team_id = p_team and e.direction = 'outbound' and e.created_at > now() - interval '7 days'
       and e.status in ('sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained')
       and not (e.tags @> '[{"name":"system"}]'::jsonb)
       and not (array_to_string(e."to", ',') ilike '%@test.delivrie.io%')
     order by e.created_at desc limit greatest(p_n, 1))
  select count(*), count(*) filter (where status = 'bounced' and public.is_hard_bounce(id)) from recent
$$;

-- How many different recipient domains a team has emailed lately. For holding brand-new accounts that blast a list.
create or replace function public.team_recent_domains(p_team uuid, p_hours integer default 24)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(distinct lower(split_part(regexp_replace(x, '^.*<|>.*$', '', 'g'), '@', 2)))
    from public.emails e, unnest(e."to") x
   where e.team_id = p_team and e.direction = 'outbound' and e.created_at > now() - make_interval(hours => p_hours)
     and not (e.tags @> '[{"name":"system"}]'::jsonb) and x not ilike '%@test.delivrie.io%'
$$;

-- Platform-wide rate for the admin alert.
create or replace function public.platform_bounce_stats(p_days integer default 7)
returns table(sent bigint, bounced bigint, complained bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(sent), 0)::bigint, coalesce(sum(bounced), 0)::bigint, coalesce(sum(complained), 0)::bigint from public.reputation_stats(p_days)
$$;

revoke all on function public.is_hard_bounce(uuid) from public, anon, authenticated;
revoke all on function public.reputation_stats(integer) from public, anon, authenticated;
revoke all on function public.team_recent_bounces(uuid, integer) from public, anon, authenticated;
revoke all on function public.team_recent_domains(uuid, integer) from public, anon, authenticated;
revoke all on function public.platform_bounce_stats(integer) from public, anon, authenticated;

-- Admin overview: email stats leave out test addresses and our own notices, and count only real hard bounces.
create or replace function public.admin_overview()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
declare r jsonb; since timestamptz := now() - interval '30 days';
begin
  perform public.admin_guard();
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from auth.users where created_at > since),
    'users_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'teams', (select count(*) from public.teams),
    'plans', (select coalesce(jsonb_object_agg(plan_transactional, n), '{}') from (select plan_transactional, count(*) n from public.teams group by 1) x),
    'marketing_plans', (select coalesce(jsonb_object_agg(plan_marketing, n), '{}') from (select plan_marketing, count(*) n from public.teams group by 1) x),
    'emails_30d', (select count(*) from public.emails where direction = 'outbound' and created_at > since),
    'emails_today', (select count(*) from public.emails where direction = 'outbound' and created_at > date_trunc('day', now())),
    'status_30d', (select coalesce(jsonb_object_agg(status, n), '{}') from (
        select status, count(*) n from public.emails
         where direction = 'outbound' and created_at > since
           and not (tags @> '[{"name":"system"}]'::jsonb) and not (array_to_string("to", ',') ilike '%@test.delivrie.io%')
         group by 1) x),
    'hard_bounced_30d', (select count(*) from public.emails e where e.direction = 'outbound' and e.created_at > since and e.status = 'bounced'
        and not (e.tags @> '[{"name":"system"}]'::jsonb) and not (array_to_string(e."to", ',') ilike '%@test.delivrie.io%') and public.is_hard_bounce(e.id)),
    'blocked_30d', (select count(*) from public.emails where direction = 'outbound' and created_at > since and status = 'suppressed'),
    'domains', (select count(*) from public.domains),
    'domains_verified', (select count(*) from public.domains where status = 'verified'),
    'api_keys', (select count(*) from public.api_keys),
    'support_30d', (select count(*) from public.support_requests where created_at > since),
    'feedback_30d', (select count(*) from public.feedback where created_at > since),
    'revenue_30d', (select coalesce(jsonb_object_agg(currency, amt), '{}') from (select currency, sum(amount) amt from public.billing_invoices where status = 'success' and created_at > since group by 1) x),
    'revenue_all', (select coalesce(jsonb_object_agg(currency, amt), '{}') from (select currency, sum(amount) amt from public.billing_invoices where status = 'success' group by 1) x),
    'credits_outstanding', (select coalesce(sum(credits), 0) from public.teams)
  ) into r;
  return r;
end $function$;
