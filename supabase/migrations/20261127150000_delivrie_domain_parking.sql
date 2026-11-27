-- Domains whose DNS records never appeared are taken out of Amazon SES after 2 days ("parked"), so Amazon doesn't
-- email the account owner about identities stuck unverified. See parkDomain in ses.ts.
alter table public.domains add column if not exists ses_parked_at timestamptz;
