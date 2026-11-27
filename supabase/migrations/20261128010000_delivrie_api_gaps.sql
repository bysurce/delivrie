-- API gaps: attachment downloads, contact imports.
--
-- Attachments: the files of sent and received emails are kept in a private storage bucket so the API can hand out
-- download links. They follow the 30-day content retention: purge_expired_content() queues the files of expired
-- emails in attachment_purge, and the API's cron deletes them from storage (storage objects can't be deleted in SQL).
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 41943040)
on conflict (id) do nothing;

create table if not exists public.attachment_purge (
  path text primary key,
  queued_at timestamptz not null default now()
);
alter table public.attachment_purge enable row level security;

create or replace function public.purge_expired_content() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.attachment_purge (path)
  select a->>'path'
    from public.emails e, jsonb_array_elements(case when jsonb_typeof(e.attachments) = 'array' then e.attachments else '[]'::jsonb end) a
   where e.status not in ('queued', 'scheduled')
     and e.attachments <> '[]'::jsonb
     and e.created_at < now() - interval '30 days'
     and a ? 'path'
  on conflict do nothing;
  update public.emails
     set html = null, text = null, attachments = '[]'::jsonb
   where status not in ('queued', 'scheduled')
     and (html is not null or text is not null or attachments <> '[]'::jsonb)
     and created_at < now() - interval '30 days';
  delete from public.request_logs where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.purge_expired_content() from public, anon, authenticated;

-- Contact imports: a CSV or a list of contacts sent to POST /contacts/imports, processed in the background.
create table if not exists public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  segment_ids uuid[] not null default '{}',
  update_existing boolean not null default true,
  total int not null default 0,
  processed int not null default 0,
  created int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  errors jsonb not null default '[]'::jsonb,         -- [{ row, email, message }], first 100
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists contact_imports_team on public.contact_imports(team_id, created_at desc);
create index if not exists contact_imports_created_by on public.contact_imports(created_by);
alter table public.contact_imports enable row level security;
drop policy if exists contact_imports_member_select on public.contact_imports;
create policy contact_imports_member_select on public.contact_imports for select to authenticated using (public.is_team_member(team_id));
grant select on public.contact_imports to authenticated;
