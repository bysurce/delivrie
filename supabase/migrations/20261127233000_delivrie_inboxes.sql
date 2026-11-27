-- Inboxes for people and agents: named inboxes (an address on a receiving domain), an agent per inbox,
-- drafts, internal notes, assignment, and spam and trash folders. Additive: existing threads keep working and
-- each address that already has mail becomes an inbox.

-- ------------------------------------------------------------------ inboxes
create table if not exists public.inboxes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  domain_id uuid references public.domains(id) on delete set null,
  address text not null check (address = lower(address) and address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  -- { enabled, instructions, tone, actions: [...], forward_to: [...], signature }
  agent jsonb not null default '{"enabled": false}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, address)
);
create index if not exists inboxes_domain on public.inboxes(domain_id);
drop trigger if exists inboxes_touch on public.inboxes;
create trigger inboxes_touch before update on public.inboxes for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ threads: inbox, assignee, spam and trash
alter table public.inbox_threads add column if not exists inbox_id uuid references public.inboxes(id) on delete set null;
alter table public.inbox_threads add column if not exists assignee_id uuid references auth.users(id) on delete set null;
alter table public.inbox_threads drop constraint if exists inbox_threads_status_check;
alter table public.inbox_threads add constraint inbox_threads_status_check check (status in ('open', 'archived', 'spam', 'trash'));
create index if not exists inbox_threads_inbox on public.inbox_threads(team_id, inbox_id, last_at desc);
create index if not exists inbox_threads_assignee on public.inbox_threads(assignee_id);

-- A new thread joins the inbox for its address.
create or replace function public.inbox_thread_set_inbox() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.inbox_id is null then
    select id into new.inbox_id from public.inboxes where team_id = new.team_id and address = lower(new.mailbox);
  end if;
  return new;
end $$;
revoke execute on function public.inbox_thread_set_inbox() from public, anon, authenticated;
drop trigger if exists inbox_threads_set_inbox on public.inbox_threads;
create trigger inbox_threads_set_inbox before insert on public.inbox_threads for each row execute function public.inbox_thread_set_inbox();

-- A new inbox picks up the threads already at its address; a removed one leaves them as "Other mail".
create or replace function public.inbox_claim_threads() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.inbox_threads set inbox_id = new.id where team_id = new.team_id and mailbox = new.address and inbox_id is null;
  return new;
end $$;
revoke execute on function public.inbox_claim_threads() from public, anon, authenticated;
drop trigger if exists inboxes_claim_threads on public.inboxes;
create trigger inboxes_claim_threads after insert on public.inboxes for each row execute function public.inbox_claim_threads();

-- ------------------------------------------------------------------ drafts
create table if not exists public.inbox_drafts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  inbox_id uuid references public.inboxes(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  "from" text,
  "to" text[] not null default '{}',
  cc text[] not null default '{}',
  bcc text[] not null default '{}',
  subject text not null default '',
  text text not null default '' check (char_length(text) <= 100000),
  html text check (char_length(html) <= 500000),
  source text not null default 'user' check (source in ('user', 'agent')),
  note text check (char_length(note) <= 1000),          -- why the agent wrote it
  status text not null default 'draft' check (status in ('draft', 'sent', 'discarded')),
  sent_email_id uuid references public.emails(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inbox_drafts_team on public.inbox_drafts(team_id, status, updated_at desc);
create index if not exists inbox_drafts_thread on public.inbox_drafts(thread_id);
create index if not exists inbox_drafts_inbox on public.inbox_drafts(inbox_id);
create index if not exists inbox_drafts_email on public.inbox_drafts(sent_email_id);
drop trigger if exists inbox_drafts_touch on public.inbox_drafts;
create trigger inbox_drafts_touch before update on public.inbox_drafts for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ internal notes (never emailed)
create table if not exists public.inbox_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_kind text not null default 'member' check (author_kind in ('member', 'agent')),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists inbox_notes_thread on public.inbox_notes(thread_id, created_at);
create index if not exists inbox_notes_team on public.inbox_notes(team_id);

-- ------------------------------------------------------------------ what the agent did, for every run
create table if not exists public.inbox_agent_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  inbox_id uuid references public.inboxes(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'skipped', 'failed')),
  actions jsonb not null default '[]'::jsonb,
  summary text,
  error text,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists inbox_agent_runs_team on public.inbox_agent_runs(team_id, created_at desc);
create index if not exists inbox_agent_runs_inbox on public.inbox_agent_runs(inbox_id, created_at desc);
create index if not exists inbox_agent_runs_thread on public.inbox_agent_runs(thread_id);
create index if not exists inbox_agent_runs_email on public.inbox_agent_runs(email_id);

-- ------------------------------------------------------------------ access
alter table public.inboxes enable row level security;
alter table public.inbox_drafts enable row level security;
alter table public.inbox_notes enable row level security;
alter table public.inbox_agent_runs enable row level security;

-- Inboxes: everyone on the team sees them; admins create, change (including the agent) and remove them.
drop policy if exists inboxes_member_select on public.inboxes;
create policy inboxes_member_select on public.inboxes for select to authenticated using (public.is_team_member(team_id));
drop policy if exists inboxes_admin_insert on public.inboxes;
create policy inboxes_admin_insert on public.inboxes for insert to authenticated with check (public.is_team_admin(team_id));
drop policy if exists inboxes_admin_update on public.inboxes;
create policy inboxes_admin_update on public.inboxes for update to authenticated using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
drop policy if exists inboxes_admin_delete on public.inboxes;
create policy inboxes_admin_delete on public.inboxes for delete to authenticated using (public.is_team_admin(team_id));
grant select, insert, update, delete on public.inboxes to authenticated;

-- Drafts: shared by the team, so anyone can pick one up and finish it.
drop policy if exists inbox_drafts_member_select on public.inbox_drafts;
create policy inbox_drafts_member_select on public.inbox_drafts for select to authenticated using (public.is_team_member(team_id));
drop policy if exists inbox_drafts_member_insert on public.inbox_drafts;
create policy inbox_drafts_member_insert on public.inbox_drafts for insert to authenticated with check (public.is_team_member(team_id) and source = 'user');
drop policy if exists inbox_drafts_member_update on public.inbox_drafts;
create policy inbox_drafts_member_update on public.inbox_drafts for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
drop policy if exists inbox_drafts_member_delete on public.inbox_drafts;
create policy inbox_drafts_member_delete on public.inbox_drafts for delete to authenticated using (public.is_team_member(team_id));
grant select, insert, update, delete on public.inbox_drafts to authenticated;

-- Notes: the team reads them; you write as yourself and remove only your own.
drop policy if exists inbox_notes_member_select on public.inbox_notes;
create policy inbox_notes_member_select on public.inbox_notes for select to authenticated using (public.is_team_member(team_id));
drop policy if exists inbox_notes_member_insert on public.inbox_notes;
create policy inbox_notes_member_insert on public.inbox_notes for insert to authenticated with check (public.is_team_member(team_id) and author_id = auth.uid() and author_kind = 'member');
drop policy if exists inbox_notes_own_delete on public.inbox_notes;
create policy inbox_notes_own_delete on public.inbox_notes for delete to authenticated using (public.is_team_member(team_id) and author_id = auth.uid());
grant select, insert, delete on public.inbox_notes to authenticated;

-- Agent runs: written by the API only; the team can read them.
drop policy if exists inbox_agent_runs_member_select on public.inbox_agent_runs;
create policy inbox_agent_runs_member_select on public.inbox_agent_runs for select to authenticated using (public.is_team_member(team_id));
grant select on public.inbox_agent_runs to authenticated;

-- ------------------------------------------------------------------ backfill
-- Every address that already has mail becomes an inbox named after its local part (support@… → Support).
insert into public.inboxes (team_id, domain_id, address, name)
select distinct on (t.team_id, lower(t.mailbox)) t.team_id,
  (select d.id from public.domains d where d.team_id = t.team_id
     and (split_part(lower(t.mailbox), '@', 2) = d.name or split_part(lower(t.mailbox), '@', 2) like '%.' || d.name)
   order by char_length(d.name) desc limit 1),
  lower(t.mailbox),
  left(initcap(replace(replace(split_part(lower(t.mailbox), '@', 1), '.', ' '), '-', ' ')), 60)
from public.inbox_threads t
where lower(t.mailbox) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
on conflict (team_id, address) do nothing;
