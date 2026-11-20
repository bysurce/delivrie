-- Automatic forwarding: a copy of every email a domain receives is sent on to these addresses (for example a
-- Gmail inbox). Empty means off.
alter table public.domains add column if not exists receiving_forward_to text[] not null default '{}';
