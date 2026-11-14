-- Starter plan ($10 / ₦10,000, 20,000 emails) joins Pro ($20 / ₦27,000, 60,000 emails) and Scale.
create or replace function public.admin_set_plan(p_team uuid, p_plan text) returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.admin_guard();
  if p_plan not in ('free','starter','pro','scale','enterprise') then raise exception 'Unknown plan %', p_plan; end if;
  update public.teams set plan_transactional = p_plan,
    billing = billing || jsonb_build_object('comped_by', auth.uid(), 'comped_at', now())
   where id = p_team;
end $function$;

create or replace function public.run_billing_watch() returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare s text;
begin
  if not exists (select 1 from public.teams
                  where coalesce((billing->'auto_topup'->>'enabled')::boolean, false)
                     or plan_transactional in ('starter', 'pro', 'scale')
                     or credits > 0) then return; end if;
  select value into s from public.system_settings where key = 'cron_secret';
  perform net.http_post(
    url := 'https://hnjejflinvaoxbduxeiu.supabase.co/functions/v1/billing/cron/watch',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', s),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
end $function$;
