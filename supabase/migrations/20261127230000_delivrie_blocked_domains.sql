-- Domains no account may add or send from (abuse). Covers subdomains too: blocking example.com blocks mail.example.com.
create table if not exists public.blocked_domains (
  name text primary key check (name = lower(name)),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.blocked_domains enable row level security;
revoke all on public.blocked_domains from anon, authenticated;

create or replace function public.domain_is_blocked(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocked_domains b where lower(p_name) = b.name or lower(p_name) like '%.' || b.name);
$$;
revoke all on function public.domain_is_blocked(text) from public, anon, authenticated;

-- Adding a blocked domain fails; an existing one can never come back as verified.
create or replace function public.guard_blocked_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.domain_is_blocked(new.name) then
    if tg_op = 'INSERT' or new.name is distinct from old.name then
      raise exception 'This domain can''t be used on Delivrie. Contact support@delivrie.io if you think this is a mistake.' using errcode = 'P0001';
    end if;
    new.status := 'failed';
  end if;
  return new;
end $$;
drop trigger if exists guard_blocked_domain on public.domains;
create trigger guard_blocked_domain before insert or update on public.domains for each row execute function public.guard_blocked_domain();

insert into public.blocked_domains (name, reason) values ('rayyanjan.com', 'Phishing (banned Linkt/Linnks accounts)') on conflict (name) do nothing;
update public.domains set status = 'failed' where public.domain_is_blocked(name);
