-- Billing moves to Stripe (USD). Stripe invoices have a hosted receipt page and may include tax.
alter table public.billing_invoices add column if not exists url text;
alter table public.billing_invoices add column if not exists tax bigint not null default 0;
create index if not exists teams_stripe_customer on public.teams ((billing->>'stripe_customer')) where billing ? 'stripe_customer';
