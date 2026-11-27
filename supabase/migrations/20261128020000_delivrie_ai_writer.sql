-- AI writing in the email editor: drafts from a URL or a brief in the team's brand voice, rewrites of selected
-- blocks, and live edits by agents (MCP / API) that show up in an open editor.
alter table public.teams add column if not exists brand_voice text check (char_length(brand_voice) <= 2000);

-- Set when an agent or the API changes an email's content; the open editor polls it and applies the change.
-- { by: "Claude (MCP)", at: "2026-11-28T10:00:00Z", rev: 3, summary: "Rewrote the intro" }
alter table public.templates add column if not exists agent_edit jsonb;
alter table public.broadcasts add column if not exists agent_edit jsonb;

-- One row per AI writing request, for the monthly allowance and for support.
create table if not exists public.ai_writer_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('draft', 'rewrite', 'voice', 'subject')),
  model text,
  source_url text,
  input_tokens int,
  output_tokens int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_writer_runs_team on public.ai_writer_runs(team_id, created_at desc);
create index if not exists ai_writer_runs_user on public.ai_writer_runs(user_id);
alter table public.ai_writer_runs enable row level security;
drop policy if exists ai_writer_runs_member_select on public.ai_writer_runs;
create policy ai_writer_runs_member_select on public.ai_writer_runs for select to authenticated using (public.is_team_member(team_id));
grant select on public.ai_writer_runs to authenticated;
