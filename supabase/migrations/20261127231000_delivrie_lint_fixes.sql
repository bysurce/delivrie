-- Advisor fixes: the blocked-domain trigger function isn't callable through the API, and invoice_usd has a fixed search_path.
revoke all on function public.guard_blocked_domain() from public, anon, authenticated;
alter function public.invoice_usd(public.billing_invoices) set search_path = public;
-- Leaderboard and "Mine" filter look support threads up by these people.
create index if not exists support_threads_assignee_id_fk on public.support_threads (assignee_id);
create index if not exists support_threads_first_response_by_fk on public.support_threads (first_response_by);
create index if not exists support_threads_resolved_by_id_fk on public.support_threads (resolved_by_id);
