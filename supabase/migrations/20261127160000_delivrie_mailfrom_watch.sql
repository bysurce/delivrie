-- Custom MAIL FROM is switched off on verified domains whose return-path MX record never appeared (so Amazon doesn't
-- email the account owner about it) and back on when it does. See mailFromWatch in ses.ts.
alter table public.domains add column if not exists mailfrom_parked_at timestamptz;
alter table public.domains add column if not exists mailfrom_checked_at timestamptz;
