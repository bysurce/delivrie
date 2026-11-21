-- When Delivrie can already see a domain's DKIM record but Amazon SES hasn't verified it yet, the key is handed to
-- SES again so it re-checks straight away. This records when that last happened (at most every 15 minutes).
alter table public.domains add column if not exists dkim_resubmitted_at timestamptz;
