---
title: Quickstart
group: Get started
order: 2
description: Send your first email in five minutes: create an account and API key, test with the shared sender, then verify your own domain.
---
This takes about five minutes. You'll send a test email right away, then set up your own domain so you can email anyone.

## 1. Create an account

Sign up at [delivrie.io/signup](https://delivrie.io/signup). The Free plan includes 4,000 emails a month (up to 133 a day), so you don't need a card.

## 2. Create an API key

Open [API keys](https://delivrie.io/api-keys) in the dashboard and click **Create API key**.

- **Full access** keys can call every endpoint. Use them for scripts and back-office tools.
- **Sending access** keys can only send email, optionally from one domain. Use them in production apps.

Keys start with `dlv_` and are shown once. Store the key in an environment variable, never in your code:

```bash .env
DELIVRIE_API_KEY=dlv_your_key
```

## 3. Send a test email

You can send before you verify a domain. Use the shared sender `onboarding@delivrie.io` as the `from` address, and send to either:

- the **test addresses** `delivered@test.delivrie.io`, `bounced@test.delivrie.io` and `complained@test.delivrie.io`. They behave like real inboxes and fire real events. See [Test addresses](/docs/test-mode).
- **yourself and your teammates**: the email addresses of people on your Delivrie team.

```bash cURL
curl -X POST https://delivrie.io/api/emails \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: quickstart-1" \
  -d '{
    "from": "Acme <onboarding@delivrie.io>",
    "to": "delivered@test.delivrie.io",
    "subject": "My first Delivrie email",
    "html": "<h1>It works</h1><p>Sent with Delivrie.</p>"
  }'
```

```ts Node.js
// npm install delivrie
import { Delivrie } from "delivrie";

const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);

const { data, error } = await delivrie.emails.send(
  {
    from: "Acme <onboarding@delivrie.io>",
    to: "delivered@test.delivrie.io",
    subject: "My first Delivrie email",
    html: "<h1>It works</h1><p>Sent with Delivrie.</p>",
  },
  { idempotencyKey: "quickstart-1" },
);

if (error) throw new Error(`${error.name}: ${error.message}`);
console.log("Sent", data.id);
```

```python Python
import os, requests

res = requests.post(
    "https://delivrie.io/api/emails",
    headers={
        "Authorization": f"Bearer {os.environ['DELIVRIE_API_KEY']}",
        "Idempotency-Key": "quickstart-1",
    },
    json={
        "from": "Acme <onboarding@delivrie.io>",
        "to": "delivered@test.delivrie.io",
        "subject": "My first Delivrie email",
        "html": "<h1>It works</h1><p>Sent with Delivrie.</p>",
    },
)
res.raise_for_status()
print("Sent", res.json()["id"])
```

A successful send returns `200` with `{ "id": "..." }`. Open [Emails](https://delivrie.io/emails) in the dashboard to watch it move from queued to sent to delivered.

> **Note:** If you get `422 validation_error`, read the `message`. It says exactly what's wrong, for example a missing field or a `from` domain that isn't verified yet.

## 4. Verify your domain

To send to anyone, add a domain you own.

1. Open [Domains](https://delivrie.io/domains/new) and add a subdomain such as `mail.acme.com`. A subdomain keeps your main domain's reputation separate from your app's email.
2. Add the DNS records Delivrie shows you at your DNS provider: a DKIM `TXT` record, and an `MX` and `TXT` record on the `send` subdomain for SPF and bounces.
3. Click **Verify DNS records**. Most providers update within minutes.

Then send from any address on that domain, like `orders@mail.acme.com`, to anyone. [Domains and DNS](/docs/domains) explains each record, and [Why isn't my domain verifying?](/docs/domain-not-verifying) covers the usual fixes.

## 5. Next steps

- Track deliveries, bounces and opens with [webhooks](/docs/webhooks).
- Reuse designs with [templates](/docs/templates).
- Find your framework under SDKs and frameworks: [Next.js](/docs/nextjs), [Express](/docs/express), [Python](/docs/python), [PHP and Laravel](/docs/php), [Ruby and Rails](/docs/ruby), [Go](/docs/go), [Rust](/docs/rust), [Supabase](/docs/supabase), [Cloudflare Workers](/docs/cloudflare-workers).
- Before you go live, read the [Deliverability guide](/docs/deliverability).
