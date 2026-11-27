-- Uptime counts outages only. "Degraded" (slower than usual, partly working) is shown on the status page but isn't
-- downtime, the same way most status pages count it.
create or replace function public.status_summary(p_days int default 90)
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (component) component, state, latency_ms, detail, checked_at
    from status_checks order by component, checked_at desc
  ),
  daily as (
    select component, (checked_at at time zone 'utc')::date as day,
           count(*) as n, count(*) filter (where state <> 'down') as ok,
           case when bool_or(state = 'down') then 'down' when bool_or(state = 'degraded') then 'degraded' else 'operational' end as worst
    from status_checks where checked_at > now() - make_interval(days => p_days)
    group by 1, 2
  ),
  marked as (
    select component, state, detail, checked_at,
           sum(case when state = 'operational' then 1 else 0 end) over (partition by component order by checked_at) as grp
    from status_checks where checked_at > now() - make_interval(days => p_days)
  ),
  incidents as (
    select component, min(checked_at) as started_at,
           (select min(s2.checked_at) from status_checks s2 where s2.component = m.component and s2.checked_at > max(m.checked_at) and s2.state = 'operational') as resolved_at,
           case when bool_or(state = 'down') then 'down' else 'degraded' end as severity,
           (array_agg(detail order by checked_at))[1] as detail, count(*) as checks
    from marked m where state <> 'operational'
    group by component, grp
    having count(*) >= 2   -- a single failed check is noise; two in a row (10 minutes) is an incident
  )
  select jsonb_build_object(
    'latest', coalesce((select jsonb_agg(to_jsonb(l)) from latest l), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('component', component, 'day', day, 'uptime', round(100.0 * ok / n, 2), 'worst', worst)) from daily), '[]'::jsonb),
    'uptime', coalesce((select jsonb_object_agg(component, u) from (select component, round(100.0 * sum(ok) / nullif(sum(n), 0), 3) as u from daily group by component) x), '{}'::jsonb),
    'incidents', coalesce((select jsonb_agg(to_jsonb(i) order by started_at desc) from (select * from incidents order by started_at desc limit 40) i), '[]'::jsonb)
  );
$$;
revoke all on function public.status_summary(int) from public, anon, authenticated;
grant execute on function public.status_summary(int) to service_role;
