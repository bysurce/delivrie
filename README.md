# Delivrie

[![mcptry](https://mcptry.com/badge/io.github.codeddesigner/delivrie)](https://mcptry.com/servers/io.github.codeddesigner/delivrie)

Email for developers: transactional and marketing email with a REST API, signed webhooks, a visual broadcast editor, audiences, metrics, and an MCP server for AI agents. Sending runs on Amazon SES.

Live at https://delivrie.io

## Structure

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `script.js` | Marketing landing page |
| `app.html`, `app/` | Dashboard SPA (vanilla JS ES modules, no build step) |
| `assets/` | Logos, favicon and icons (from the Figma brand page) |
| `supabase/functions/delivrie/` | Edge function: REST API, SES/SNS integration, webhooks, cron, MCP server |
| `supabase/functions/billing/` | Edge function: subscriptions, credits and overage. Teams in Nigeria pay in Naira through Paystack; everyone else pays in USD through Stripe (with Stripe Tax). Served at `/api/billing/*` |
| `supabase/migrations/` | Database schema: tables, row-level security, RPCs, cron job, storage bucket |
| `vercel.json` | Rewrites `/api/*` to the edge function and app routes to `app.html` |

## Deploy

- **Frontend:** static files on Vercel. No build command; output directory is the repo root.
- **Backend functions:** pushed changes under `supabase/functions/` deploy automatically through `.github/workflows/deploy-functions.yml` (needs the `SUPABASE_ACCESS_TOKEN` repository secret).
- **Backend:** Supabase (Postgres + Auth + Storage) with the `delivrie` edge function.
  To recreate the database on a new project, run the files in `supabase/migrations/` in order (or `supabase db push`). The cron migration contains the project's function URL; change it if you deploy to a different project.

## Configuration (Supabase edge function secrets)

| Secret | Required | Purpose |
|---|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Yes | IAM user with `ses:*` and SNS access to `delivrie-events` topics |
| `APP_URL` | Yes | Public URL, e.g. `https://delivrie.io` |
| `SYSTEM_FROM` | Optional | Sender for invites/system mail, e.g. `Delivrie <notifications@delivrie.io>` |
| `SYSTEM_REGION` | Optional | Default SES region (default `eu-west-1`) |
| `ANTHROPIC_API_KEY` | Optional | Enables AI answers in Help → Ask Delivrie |
| `ENFORCE_LIMITS` | Optional | `true` to enforce plan limits |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret key (`sk_test_…` while testing, `sk_live_…` in production) |
| `STRIPE_WEBHOOK_SECRET` | For billing | Signing secret of the Stripe webhook endpoint `https://delivrie.io/api/billing/stripe/webhook` (`whsec_…`) |
| `PAYSTACK_SECRET_KEY` | For billing | Paystack secret key for Naira payments (webhook `https://delivrie.io/api/billing/webhook` is signed with it) |
| `VAT_RATE` | Optional | Percent VAT added to Naira top-ups and overage, e.g. `7.5` |
| `DLV_PROXY_SECRET` | Recommended | A long random value, set to the same value here and on Vercel (Project → Settings → Environment Variables). Stops requests that skip delivrie.io from faking their country to get Naira prices |

The Supabase anon key in `app/js/lib/sb.js` is public by design; data access is protected by row-level security.
