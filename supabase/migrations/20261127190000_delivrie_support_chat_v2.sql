-- Support chat v2 (Figma 10.6): the assistant answers first, a person takes over on request.
-- A conversation starts with the assistant (status 'bot'). "Talk to a person" turns it into a numbered ticket
-- (#DLV-2041, status 'open') with a topic and context attached; the team replies, resolves it ('closed'), and the
-- customer rates it. Bot conversations never show in Admin → Support.

alter table public.support_threads drop constraint if exists support_threads_status_check;
alter table public.support_threads add constraint support_threads_status_check check (status in ('bot', 'open', 'closed'));
alter table public.support_threads drop constraint if exists support_threads_last_author_check;
alter table public.support_threads add constraint support_threads_last_author_check check (last_author in ('customer', 'support', 'bot', 'system'));

create sequence if not exists public.support_ticket_seq start 2041;
alter table public.support_threads
  add column if not exists number int,
  add column if not exists subject text,
  add column if not exists topic text,
  add column if not exists escalated_at timestamptz,
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists assignee_name text,
  add column if not exists agent_typing_at timestamptz,
  add column if not exists support_seen_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists rating text check (rating in ('bad', 'okay', 'great')),
  add column if not exists rating_comment text,
  add column if not exists rated_at timestamptz,
  add column if not exists customer_emailed_at timestamptz;
create unique index if not exists support_threads_number on public.support_threads(number) where number is not null;

-- Existing conversations were all with the team: give them ticket numbers.
update public.support_threads set number = nextval('public.support_ticket_seq'), escalated_at = coalesce(escalated_at, created_at)
 where number is null and status <> 'bot';

alter table public.support_messages drop constraint if exists support_messages_author_check;
alter table public.support_messages add constraint support_messages_author_check check (author in ('customer', 'support', 'bot', 'system'));
-- Sources (chips), actions (buttons), attachments (email headers, DNS checks) and feedback on bot answers.
alter table public.support_messages add column if not exists meta jsonb not null default '{}'::jsonb;

-- Gives an escalated conversation the next ticket number (sequences aren't reachable through the REST API).
create or replace function public.support_next_number() returns int
language sql volatile security definer set search_path = public as $$ select nextval('public.support_ticket_seq')::int $$;
revoke all on function public.support_next_number() from public, anon, authenticated;
