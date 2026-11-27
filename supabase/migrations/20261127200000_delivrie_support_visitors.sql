-- Contact support on the website for visitors who aren't signed in. Their browser keeps a random token; only its
-- hash is stored. guest_ip is for rate limits; guest_name is optional, given when they ask for a person.
alter table public.support_threads
  add column if not exists guest_token_hash text,
  add column if not exists guest_ip text,
  add column if not exists guest_name text;
create index if not exists support_threads_guest on public.support_threads(guest_token_hash, last_message_at desc) where guest_token_hash is not null;
create index if not exists support_threads_guest_ip on public.support_threads(guest_ip, created_at desc) where guest_ip is not null;
