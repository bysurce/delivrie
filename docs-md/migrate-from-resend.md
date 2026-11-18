# Migrate from Resend

Move from Resend to Delivrie without rewriting your app: same request shapes, point the Resend SDK at Delivrie with one environment variable, or switch to the delivrie package.

Delivrie's API uses the same endpoints, field names and response shapes as Resend's, so most apps switch by changing two environment variables. Plan for about 30 minutes, most of it waiting for DNS.

## 1. Add your domain to Delivrie

Add the same sending domain in [Domains](https://delivrie.io/domains/new). Delivrie gives you a new DKIM record (its own selector, so it sits next to Resend's without conflict) and SPF records for a bounce subdomain.

> **Important:** Resend and Delivrie both use the `send` subdomain for bounces by default, and a name can only have one SPF record. To keep Resend working while you switch, set a different bounce subdomain when you add the domain: in the dashboard under **Advanced options**, or with `"return_path": "bounces"` in [`POST /domains`](/docs/api/create-domain). You can remove Resend's records after the switch.

Leave out `region` when you create the domain, or use `eu-west-1`. Other regions aren't available yet.

## 2. Create a Delivrie API key

Create one in [API keys](https://delivrie.io/api-keys). Delivrie keys start with `dlv_`. `full_access` and `sending_access` work the same way as in Resend.

## 3. Point your code at Delivrie

### Option A: keep the Resend SDK

The official Resend SDKs can send to another API address. Set two environment variables and redeploy:

| SDK | Set these |
| --- | --- |
| Node.js (`resend`) | `RESEND_BASE_URL=https://delivrie.io/api` and `RESEND_API_KEY=dlv_...` |
| Python (`resend`) | `RESEND_API_URL=https://delivrie.io/api` and `RESEND_API_KEY=dlv_...` |
| PHP (`resend/resend-php`, Laravel) | `RESEND_BASE_URL=https://delivrie.io/api` and `RESEND_API_KEY=dlv_...` |
| Go (`resend-go`) | `RESEND_BASE_URL=https://delivrie.io/api/` (keep the trailing slash) |

No code changes. `resend.emails.send`, `resend.batch.send`, `resend.emails.get`, scheduling, tags and idempotency keys behave the same. The Node SDK's `react` option keeps working too, because the SDK turns your React Email component into HTML before sending.

### Option B: switch to the Delivrie SDK (Node.js)

```bash
npm uninstall resend && npm install delivrie
```

```ts Before (Resend)
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const { data, error } = await resend.emails.send({
  from: "Acme <hello@mail.acme.com>",
  to: ["ada@example.com"],
  subject: "Welcome",
  html: "<p>Welcome to Acme</p>",
});
```

```ts After (Delivrie)
import { Delivrie } from "delivrie";

const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);
const { data, error } = await delivrie.emails.send({
  from: "Acme <hello@mail.acme.com>",
  to: ["ada@example.com"],
  subject: "Welcome",
  html: "<p>Welcome to Acme</p>",
});
```

Same `{ data, error }` result, same field names. React Email works the same way too: pass `react: <Welcome />` and keep `@react-email/render` installed.

### Option C: plain HTTP

Replace `https://api.resend.com` with `https://delivrie.io/api` and your `re_...` key with a `dlv_...` key. Paths and bodies stay the same.

## 4. Update webhooks

Create a webhook in [Webhooks](https://delivrie.io/webhooks) with the same events. Event names (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.received` and the rest) and the `{ type, created_at, data }` body are the same.

Signatures use the same HMAC scheme, but the headers are named `webhook-id`, `webhook-timestamp` and `webhook-signature` (the [Standard Webhooks](https://www.standardwebhooks.com) names) instead of `svix-id`, `svix-timestamp` and `svix-signature`. Use `verifyWebhook` from the `delivrie` package, or any Standard Webhooks library, with your new `whsec_` secret. See [Webhooks](/docs/webhooks) for code.

## What's different

| Resend | Delivrie |
| --- | --- |
| `https://api.resend.com` | `https://delivrie.io/api` |
| Keys start with `re_` | Keys start with `dlv_` |
| Attachments by `path` (a URL) | Send base64 `content` instead; `path` isn't supported yet |
| Audiences (`/audiences/:id/contacts`) | Contacts live at `/contacts`; group them with [segments](/docs/contacts) |
| Broadcasts to an audience | Broadcasts go to a `segment_id` |
| `svix-*` webhook headers | `webhook-*` headers, same signing |
| Several sending regions | `eu-west-1` today |
| `onboarding@resend.dev` for testing | `onboarding@delivrie.io`, plus [test addresses](/docs/test-mode) |

Things Delivrie adds: an [SMTP relay](/docs/smtp) on ports 587 and 465, an [inbox](/docs/inbox) for replies, [automations](/docs/automations) triggered by events, an [MCP server](/docs/mcp) for AI assistants.

## Move your contacts and templates

- **Contacts:** export a CSV from Resend and import it in [Contacts → Import](https://delivrie.io/contacts/import), or loop over them with [`POST /contacts`](/docs/api/create-contact).
- **Templates:** copy the HTML into a new [template](/docs/templates). Variables use the same `{{{name}}}` syntax, then publish and send with `template: { id: "your-alias", variables: {...} }`. In broadcasts, `{{{RESEND_UNSUBSCRIBE_URL}}}` keeps working as an alias for `{{{unsubscribe_url}}}`.
- **Suppressions:** add addresses that bounced or complained on Resend with [`POST /suppressions`](/docs/api/add-suppression), so you don't email them again.

## Switch-over checklist

1. Domain verified in Delivrie, with a non-`send` bounce subdomain if Resend is still live.
2. `dlv_` key stored in your production environment.
3. Send a test to `delivered@test.delivrie.io` from your production sender and check it in [Emails](https://delivrie.io/emails).
4. Webhook endpoint updated for the new header names and secret, and **Send test event** returns 200.
5. Deploy. Watch [Emails](https://delivrie.io/emails) and [Logs](https://delivrie.io/logs) for an hour.
6. Remove Resend's DNS records and keys when you're happy.
