-- Retention, as promised on the pricing page, in the docs and in the Privacy Policy.
-- Permanently clears email bodies and attachments once they're older than the plan's window.
-- Recipients, subject, status, events and timestamps stay, so logs, metrics, threads and suppressions keep working.
--
-- Sent email (not part of an Inbox conversation): 1 day Free, 3 Starter and Pro, 7 Scale, 30 Enterprise.
-- Inbox mail (received email, and replies in an Inbox thread): 7 days Free, 14 Starter, 30 Pro, Scale and Enterprise.
-- API request logs: 30 days.
create or replace function public.purge_expired_content() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.emails e
     set html = null, text = null, attachments = '[]'::jsonb
    from public.teams t
   where t.id = e.team_id
     and e.status not in ('queued', 'scheduled')
     and (e.html is not null or e.text is not null or e.attachments <> '[]'::jsonb)
     and e.created_at < now() - make_interval(days =>
       case when e.direction = 'inbound' or e.thread_id is not null then
         case t.plan_transactional when 'starter' then 14 when 'pro' then 30 when 'scale' then 30 when 'enterprise' then 30 else 7 end
       else
         case t.plan_transactional when 'starter' then 3 when 'pro' then 3 when 'scale' then 7 when 'enterprise' then 30 else 1 end
       end);
  delete from public.request_logs where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.purge_expired_content() from public, anon, authenticated;
select cron.unschedule('delivrie-retention') where exists (select 1 from cron.job where jobname = 'delivrie-retention');
select cron.schedule('delivrie-retention', '41 * * * *', $$select public.purge_expired_content()$$);
