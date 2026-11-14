# Receiving email

Receive email on your domain with Delivrie: set up the MX record, choose which addresses accept mail, get email.received webhooks, read messages with the API and forward them.

Delivrie can receive email for your domain: replies to your app's emails, a `support@` address, inbound parsing for tickets or uploads. Every received message is stored, sent to your webhooks as `email.received`, and grouped into conversations in the [Inbox](/docs/inbox).

## Set it up

1. Open your domain in [Domains](https://delivrie.io/domains) and turn on **Receiving**.
2. Pick where mail arrives:
   - **A subdomain** such as `in.acme.com` (recommended). Your normal email at `acme.com`, like Google Workspace, keeps working.
   - **The domain itself.** Only do this if nothing else receives mail for it, because its MX record will point at Delivrie.
3. Choose which addresses accept mail: **all addresses** (`anything@in.acme.com`) or **only specific addresses** (mail to anything else is dropped).
4. Add the `MX` record Delivrie shows, priority `10`, and click **Verify DNS records**.

> **Warning:** Adding Delivrie's MX record to a domain that already receives mail elsewhere (Google Workspace, Microsoft 365, Zoho) sends that mail to Delivrie instead. Use a subdomain unless you mean to move your inbox.

You can also configure receiving with [`PATCH /domains/:id`](/docs/api/update-domain):

```json
{
  "receiving_enabled": true,
  "receiving_subdomain": "in",
  "receiving_mode": "specific",
  "receiving_addresses": ["support@in.acme.com", "billing@in.acme.com"]
}
```

## Get received mail as a webhook

Add a [webhook](/docs/webhooks) subscribed to `email.received`:

```json
{
  "type": "email.received",
  "created_at": "2026-11-14T10:22:31.000Z",
  "data": {
    "email_id": "a5c3e1f0-...",
    "from": "Ada Lovelace <ada@example.com>",
    "to": ["support@in.acme.com"],
    "subject": "Re: Your order is confirmed",
    "created_at": "2026-11-14T10:22:30.000Z",
    "message_id": "<CAF=abc123@mail.gmail.com>",
    "attachments": [{ "filename": "photo.jpg", "content_type": "image/jpeg", "size": 248213 }]
  }
}
```

Fetch the full message, with its HTML and text, using `GET /emails/:email_id`.

## Read received mail with the API

```bash
# Newest first; filter by the address it was sent to
curl "https://delivrie.io/api/emails/received?to=support@in.acme.com&limit=20" \
  -H "Authorization: Bearer $DELIVRIE_API_KEY"
```

`GET /emails?direction=inbound` lists received mail too.

## Reply and forward

- **Reply** from the [Inbox](/docs/inbox), or with `POST /inbox/threads/:id/reply`. Delivrie sets `In-Reply-To` and `References`, so the reply lands in the same conversation in the sender's mail app.
- **Forward** a received email with `POST /emails/:id/forward` and `{ "to": "ops@acme.com", "from": "Acme <support@mail.acme.com>" }`.

## Make your app's emails replyable

Set `reply_to` to a receiving address when you send, and customer replies come back to Delivrie:

```json
{ "from": "Acme <orders@mail.acme.com>", "reply_to": "support@in.acme.com", "to": "ada@example.com", "subject": "Your order is confirmed", "html": "..." }
```

## Spam and security checks

Each received email's `received` event records the receiving server's spam, virus, SPF, DKIM and DMARC verdicts. Check them before acting on mail automatically, especially for messages that trigger actions in your app.
