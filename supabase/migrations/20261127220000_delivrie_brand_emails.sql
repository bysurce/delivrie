-- Delivrie's own emails (Figma "Email · Headers"): flags so each alert goes out once.
alter table public.profiles add column if not exists welcome_sent_at timestamptz;
-- Everyone who already has an account has been welcomed; only new sign-ups get the welcome email.
update public.profiles set welcome_sent_at = coalesce(welcome_sent_at, now());
alter table public.domains add column if not exists dns_nudged_at timestamptz;
alter table public.teams add column if not exists bounce_warned_at timestamptz;
alter table public.webhooks add column if not exists failing_alerted_at timestamptz;

-- note_ip now says whether this address is new for the person and whether they've used others before, so the
-- API can send a "New sign-in" email the first time someone uses the dashboard from a new network.
drop function if exists public.note_ip(uuid, uuid, text);
create function public.note_ip(p_user uuid, p_team uuid, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare known boolean; others int;
begin
  select exists (select 1 from public.account_ips where user_id = p_user and ip = left(p_ip, 64)) into known;
  select count(distinct ip) into others from public.account_ips where user_id = p_user and ip <> left(p_ip, 64);
  insert into public.account_ips (user_id, team_id, ip) values (p_user, p_team, left(p_ip, 64))
  on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), ip)
  do update set last_seen = now();
  delete from public.account_ips where last_seen < now() - interval '180 days' and random() < 0.01;
  return jsonb_build_object('new', not known, 'others', others);
end $$;
revoke all on function public.note_ip(uuid, uuid, text) from public, anon, authenticated;
