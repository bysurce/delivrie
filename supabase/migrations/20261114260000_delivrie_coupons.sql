-- Coupon codes and assigned discounts.
-- A coupon takes a percentage off subscriptions, credit top-ups or both, for the first payment only or for every
-- renewal. A coupon with team_id is private to that team; with auto_apply it's an "assigned discount" that the team's
-- checkout uses without a code. Only the billing function (service role) reads or redeems coupons; platform admins
-- manage them through the admin_* functions below.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  percent_off int not null check (percent_off between 1 and 95),
  applies_to text not null default 'subscription' check (applies_to in ('subscription', 'credits', 'any')),
  plans text[],                       -- null = every plan; e.g. {starter,pro}
  intervals text[],                   -- null = monthly and yearly
  duration text not null default 'once' check (duration in ('once', 'forever')),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redemptions int not null default 0,
  expires_at timestamptz,
  team_id uuid references public.teams(id) on delete cascade,
  auto_apply boolean not null default false,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_upper on public.coupons (upper(code));
create index if not exists coupons_team on public.coupons (team_id) where team_id is not null;
alter table public.coupons enable row level security;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  reference text not null unique,      -- the Paystack payment reference
  kind text not null,                  -- transactional | marketing | credits
  plan text,
  currency text not null,
  amount_before bigint not null,
  amount_after bigint not null,
  created_at timestamptz not null default now(),
  unique (coupon_id, team_id)          -- each team uses a coupon once
);
alter table public.coupon_redemptions enable row level security;

-- Count a redemption atomically; the unique keys make a repeated webhook a no-op.
create or replace function public.redeem_coupon(p_coupon uuid, p_team uuid, p_reference text, p_kind text, p_plan text,
  p_currency text, p_before bigint, p_after bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.coupon_redemptions (coupon_id, team_id, reference, kind, plan, currency, amount_before, amount_after)
  values (p_coupon, p_team, p_reference, p_kind, p_plan, p_currency, p_before, p_after);
  update public.coupons set redemptions = redemptions + 1 where id = p_coupon;
  return true;
exception when unique_violation then
  return false;
end $$;
revoke execute on function public.redeem_coupon(uuid, uuid, text, text, text, text, bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------- admin functions
create or replace function public.admin_coupons()
returns table (id uuid, code text, description text, percent_off int, applies_to text, plans text[], intervals text[],
  duration text, max_redemptions int, redemptions int, expires_at timestamptz, team_id uuid, team_name text,
  auto_apply boolean, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
    select c.id, c.code, c.description, c.percent_off, c.applies_to, c.plans, c.intervals, c.duration, c.max_redemptions,
           c.redemptions, c.expires_at, c.team_id, t.name, c.auto_apply, c.active, c.created_at
      from public.coupons c left join public.teams t on t.id = c.team_id
     order by c.active desc, c.created_at desc;
end $$;

create or replace function public.admin_create_coupon(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text := upper(trim(coalesce(p->>'code', '')));
begin
  perform public.admin_guard('admin');
  if v_code = '' then
    -- Assigned discounts don't need a typed code; generate one so it still shows in the list.
    v_code := 'TEAM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then
    raise exception 'Codes are 3 to 40 letters, numbers, - or _';
  end if;
  if exists (select 1 from public.coupons where upper(code) = v_code) then
    raise exception 'The code % already exists', v_code;
  end if;
  insert into public.coupons (code, description, percent_off, applies_to, plans, intervals, duration, max_redemptions,
                              expires_at, team_id, auto_apply, created_by)
  values (v_code, nullif(trim(p->>'description'), ''), (p->>'percent_off')::int, coalesce(p->>'applies_to', 'subscription'),
          case when jsonb_typeof(p->'plans') = 'array' and jsonb_array_length(p->'plans') > 0 then array(select jsonb_array_elements_text(p->'plans')) end,
          case when jsonb_typeof(p->'intervals') = 'array' and jsonb_array_length(p->'intervals') > 0 then array(select jsonb_array_elements_text(p->'intervals')) end,
          coalesce(p->>'duration', 'once'), nullif(p->>'max_redemptions', '')::int, nullif(p->>'expires_at', '')::timestamptz,
          nullif(p->>'team_id', '')::uuid, coalesce((p->>'auto_apply')::boolean, false), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_set_coupon_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard('admin');
  update public.coupons set active = p_active where id = p_id;
end $$;

create or replace function public.admin_coupon_redemptions(p_id uuid)
returns table (team_id uuid, team_name text, reference text, kind text, plan text, currency text, amount_before bigint,
  amount_after bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
    select r.team_id, t.name, r.reference, r.kind, r.plan, r.currency, r.amount_before, r.amount_after, r.created_at
      from public.coupon_redemptions r left join public.teams t on t.id = r.team_id
     where r.coupon_id = p_id order by r.created_at desc;
end $$;

revoke execute on function public.admin_coupons(), public.admin_create_coupon(jsonb), public.admin_set_coupon_active(uuid, boolean),
  public.admin_coupon_redemptions(uuid) from public, anon;
grant execute on function public.admin_coupons(), public.admin_create_coupon(jsonb), public.admin_set_coupon_active(uuid, boolean),
  public.admin_coupon_redemptions(uuid) to authenticated;
