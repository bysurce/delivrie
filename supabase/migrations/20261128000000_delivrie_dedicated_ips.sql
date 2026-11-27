-- Dedicated IPs: a team requests them, a platform admin approves, and the API creates an Amazon SES managed
-- dedicated IP pool for the team in each region it sends from and points the team's domains at it. SES warms the
-- IPs up and scales them. One row per team; the API writes it (AWS calls happen there), the team can read it.
create table if not exists public.dedicated_ips (
  team_id uuid primary key references public.teams(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'provisioning', 'active', 'removing', 'off', 'declined', 'failed')),
  pools jsonb not null default '[]'::jsonb,                 -- [{ region, pool, status, error }]
  note text check (char_length(note) <= 1000),               -- the team's note: expected volume, use case
  decision_note text check (char_length(decision_note) <= 1000),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  activated_at timestamptz,
  removed_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);
create index if not exists dedicated_ips_status on public.dedicated_ips(status);
create index if not exists dedicated_ips_requested_by on public.dedicated_ips(requested_by);
create index if not exists dedicated_ips_decided_by on public.dedicated_ips(decided_by);
drop trigger if exists dedicated_ips_touch on public.dedicated_ips;
create trigger dedicated_ips_touch before update on public.dedicated_ips for each row execute function public.touch_updated_at();

alter table public.dedicated_ips enable row level security;
drop policy if exists dedicated_ips_member_select on public.dedicated_ips;
create policy dedicated_ips_member_select on public.dedicated_ips for select to authenticated using (public.is_team_member(team_id));
grant select on public.dedicated_ips to authenticated;
