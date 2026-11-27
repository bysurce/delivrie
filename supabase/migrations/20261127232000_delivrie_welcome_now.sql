-- Welcome email right away: when an account is confirmed (or created already confirmed, as with Google and GitHub),
-- ask the API to send it. Runs after the sign-up commits; never blocks or fails the sign-up. The every-minute cron
-- still sends any that this misses.
create or replace function public.on_user_confirmed() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    select value into s from public.system_settings where key = 'cron_secret';
    perform net.http_post(
      url := 'https://hnjejflinvaoxbduxeiu.supabase.co/functions/v1/delivrie/welcome-now',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', s),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000);
  end if;
  return new;
exception when others then
  raise warning 'on_user_confirmed: %', sqlerrm;
  return new;
end $$;
revoke all on function public.on_user_confirmed() from public, anon, authenticated;
drop trigger if exists on_user_confirmed on auth.users;
create trigger on_user_confirmed after insert or update of email_confirmed_at on auth.users
  for each row execute function public.on_user_confirmed();
