-- Vercel integration: a team connects Delivrie from Vercel's integration page, picks projects, and Delivrie creates
-- an API key and sets DELIVRIE_API_KEY on those projects. The Vercel access token is stored for removing the
-- environment variables and the integration later. Only the API (service role) reads this table.
create table if not exists public.vercel_connections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  configuration_id text not null,
  vercel_team_id text,
  vercel_user_id text,
  access_token text not null,
  projects jsonb not null default '[]'::jsonb,      -- [{ id, name, env_ids: [] }]
  api_key_id uuid references public.api_keys(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (configuration_id)
);
create index if not exists vercel_connections_team on public.vercel_connections(team_id);
create index if not exists vercel_connections_created_by on public.vercel_connections(created_by);
create index if not exists vercel_connections_api_key on public.vercel_connections(api_key_id);
alter table public.vercel_connections enable row level security;
drop trigger if exists vercel_connections_touch on public.vercel_connections;
create trigger vercel_connections_touch before update on public.vercel_connections for each row execute function public.touch_updated_at();
