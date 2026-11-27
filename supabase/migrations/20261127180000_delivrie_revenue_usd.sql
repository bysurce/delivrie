-- Naira payments (the retired Paystack plans) count in the admin revenue, converted to US dollars.
-- amount_usd is in cents; fx_rate is naira per dollar at the time of payment (official NFEM rate, about ₦1,347.30
-- in early November 2026). US dollar payments are counted as they are.
alter table public.billing_invoices add column if not exists amount_usd bigint;
alter table public.billing_invoices add column if not exists fx_rate numeric;
update public.billing_invoices set fx_rate = 1347.30, amount_usd = round(amount / 1347.30)
 where upper(currency) = 'NGN' and amount_usd is null;

create or replace function public.invoice_usd(i public.billing_invoices) returns bigint
language sql immutable as $$
  select coalesce(i.amount_usd, case when upper(i.currency) = 'USD' then i.amount end, 0)
$$;

revoke all on function public.invoice_usd(public.billing_invoices) from public, anon, authenticated;

drop function if exists public.admin_invoices(int);
create function public.admin_invoices(p_limit int default 50)
returns table(created_at timestamptz, team text, kind text, plan text, amount bigint, currency text, status text, reference text, amount_usd bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
  select i.created_at, t.name, i.kind, i.plan, i.amount, i.currency, i.status, i.reference, public.invoice_usd(i)
    from public.billing_invoices i left join public.teams t on t.id = i.team_id
   order by i.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;
revoke all on function public.admin_invoices(int) from public, anon;
grant execute on function public.admin_invoices(int) to authenticated;

-- Revenue in US dollars, naira included (converted); the naira totals are kept for reference.
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
    'revenue_30d', jsonb_build_object('USD', (select coalesce(sum(public.invoice_usd(i)), 0) from public.billing_invoices i where i.status = 'success' and i.created_at > since)),
    'revenue_ngn_30d', (select coalesce(sum(amount), 0) from public.billing_invoices where status = 'success' and upper(currency) = 'NGN' and created_at > since),
    'revenue_all', jsonb_build_object('USD', (select coalesce(sum(public.invoice_usd(i)), 0) from public.billing_invoices i where i.status = 'success')),
    'revenue_ngn_all', (select coalesce(sum(amount), 0) from public.billing_invoices where status = 'success' and upper(currency) = 'NGN'),
    'credits_outstanding', (select coalesce(sum(credits), 0) from public.teams)
  ) into r;
  return r;
end $function$;
