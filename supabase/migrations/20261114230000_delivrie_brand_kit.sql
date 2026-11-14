-- Brand kit: a team's logo, colours, font, address and social links, applied to email templates.
-- Saving a brand kit is a paid feature (Starter and above), so it's written only through set_team_brand(),
-- which checks the caller is a team admin and the plan allows it. Members can read it with the team row.

alter table public.teams add column if not exists brand jsonb not null default '{}'::jsonb;

create or replace function public.set_team_brand(p_team uuid, p_brand jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_clean jsonb;
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Only team admins can change the brand kit' using errcode = '42501';
  end if;
  select coalesce(plan_transactional, 'free') into v_plan from public.teams where id = p_team;
  if v_plan not in ('starter', 'pro', 'scale', 'enterprise') then
    raise exception 'The brand kit is available on the Starter plan and above' using errcode = '42501';
  end if;
  if jsonb_typeof(p_brand) <> 'object' then
    raise exception 'brand must be an object';
  end if;
  if length(p_brand::text) > 8000 then
    raise exception 'brand is too large';
  end if;
  -- Keep only the keys the brand kit uses.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_clean
    from jsonb_each(p_brand)
   where key in ('name', 'logo_url', 'logo_height', 'website', 'support_email', 'primary', 'button_text', 'heading',
                 'text', 'muted', 'background', 'card', 'font', 'radius', 'address', 'social');
  update public.teams set brand = v_clean where id = p_team;
  return v_clean;
end $$;
revoke execute on function public.set_team_brand(uuid, jsonb) from public, anon;
grant execute on function public.set_team_brand(uuid, jsonb) to authenticated;
