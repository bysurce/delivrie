-- Retention: 30 days on every plan for email content, sent and received (matches Resend).
-- Clears email bodies and attachments after 30 days; recipients, subject, status, events and threads stay.
-- API request logs: 30 days. Runs hourly at :41 (job scheduled in 20261112220000_delivrie_retention.sql).
create or replace function public.purge_expired_content() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.emails
     set html = null, text = null, attachments = '[]'::jsonb
   where status not in ('queued', 'scheduled')
     and (html is not null or text is not null or attachments <> '[]'::jsonb)
     and created_at < now() - interval '30 days';
  delete from public.request_logs where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.purge_expired_content() from public, anon, authenticated;
