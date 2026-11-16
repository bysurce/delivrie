-- Metrics count real recipients only. Emails to the test addresses (delivered@ / bounced@ / complained@
-- test.delivrie.io) are simulated by SES; the post-deploy live test sends them on purpose, which made a team's
-- bounce rate look like ~10%. reputation_stats (sending pause) already left them out.

create or replace function public.email_metrics(p_team uuid, p_since timestamp with time zone, p_domain uuid default null::uuid)
 returns table(day date, sent bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint)
 language sql stable set search_path to 'public'
as $function$
  with days as (
    select generate_series(date_trunc('day', p_since)::date, current_date, interval '1 day')::date as day
  ), ev as (
    select date_trunc('day', ev.created_at)::date as day, ev.type
    from public.email_events ev join public.emails e on e.id = ev.email_id
    where ev.team_id = p_team and ev.created_at >= p_since and e.direction = 'outbound'
      and (p_domain is null or e.domain_id = p_domain)
      and not (array_to_string(e."to", ',') ilike '%@test.delivrie.io%')
  )
  select d.day,
    count(*) filter (where ev.type = 'sent'),
    count(*) filter (where ev.type = 'delivered'),
    count(*) filter (where ev.type = 'opened'),
    count(*) filter (where ev.type = 'clicked'),
    count(*) filter (where ev.type = 'bounced'),
    count(*) filter (where ev.type = 'complained')
  from days d left join ev on ev.day = d.day
  group by d.day order by d.day;
$function$;

create or replace function public.admin_daily(p_days integer default 30)
 returns table(day date, signups bigint, teams bigint, sent bigint, delivered bigint, bounced bigint, complained bigint, opened bigint)
 language plpgsql stable security definer set search_path to 'public', 'auth'
as $function$
begin
  perform public.admin_guard();
  return query
  with d as (select generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day')::date as day),
  e as (select e.created_at::date as day, e.status from public.emails e
         where e.direction = 'outbound' and e.created_at >= current_date - least(greatest(p_days, 1), 365)
           and not (array_to_string(e."to", ',') ilike '%@test.delivrie.io%'))
  select d.day,
    (select count(*) from auth.users u where u.created_at::date = d.day),
    (select count(*) from public.teams t where t.created_at::date = d.day),
    (select count(*) from e where e.day = d.day),
    (select count(*) from e where e.day = d.day and e.status in ('delivered','opened','clicked')),
    (select count(*) from e where e.day = d.day and e.status = 'bounced'),
    (select count(*) from e where e.day = d.day and e.status = 'complained'),
    (select count(*) from e where e.day = d.day and e.status in ('opened','clicked'))
  from d order by d.day;
end $function$;
