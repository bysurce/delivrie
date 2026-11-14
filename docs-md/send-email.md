# Send an email

Everything about POST /emails: every field, display names, multiple recipients, cc and bcc, reply-to, HTML and text, attachments and inline images, tags, custom headers, scheduling and batch sending.

`POST https://delivrie.io/api/emails` sends one email. It returns as soon as the email is accepted, with its id; delivery happens in the background.

```bash cURL
curl -X POST https://delivrie.io/api/emails \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042-receipt" \
  -d '{
    "from": "Acme <orders@mail.acme.com>",
    "to": ["ada@example.com"],
    "subject": "Your order is confirmed",
    "html": "<p>Order <b>#1042</b> is on its way.</p>",
    "tags": [{ "name": "category", "value": "receipt" }]
  }'
```

```ts Node.js
const { data, error } = await delivrie.emails.send({
  from: "Acme <orders@mail.acme.com>",
  to: ["ada@example.com"],
  subject: "Your order is confirmed",
  html: "<p>Order <b>#1042</b> is on its way.</p>",
  tags: [{ name: "category", value: "receipt" }],
}, { idempotencyKey: "order-1042-receipt" });
```

```python Python
res = requests.post(
    "https://delivrie.io/api/emails",
    headers={"Authorization": f"Bearer {key}", "Idempotency-Key": "order-1042-receipt"},
    json={
        "from": "Acme <orders@mail.acme.com>",
        "to": ["ada@example.com"],
        "subject": "Your order is confirmed",
        "html": "<p>Order <b>#1042</b> is on its way.</p>",
        "tags": [{"name": "category", "value": "receipt"}],
    },
)
```

Response:

```json
{ "id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }
```

## Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `from` | string | Yes | `"Name <address@domain>"` or `"address@domain"`. The domain must be verified in your team. |
| `to` | string or string[] | Yes | Up to 50 addresses. |
| `subject` | string | Yes, unless you use `template` | |
| `html` | string | One of `html`, `text` or `template` | |
| `text` | string | | Plain-text version. Generated from `html` when you leave it out. |
| `cc`, `bcc` | string or string[] | | |
| `reply_to` | string or string[] | | Where replies go. |
| `template` | object | | `{ "id": "alias-or-id", "variables": { ... } }`. See [Templates](/docs/templates). |
| `scheduled_at` | string | | When to send. See [Scheduling](#scheduling). |
| `tags` | object[] | | `[{ "name": "...", "value": "..." }]`. Returned in webhook events. |
| `headers` | object | | Custom headers, like `{ "X-Order-Id": "1042" }`. |
| `attachments` | object[] | | See [Attachments](#attachments). |

Send the `Idempotency-Key` header too, so a retried request never sends twice. See [Idempotency and retries](/docs/idempotency).

## Senders and display names

`from` must use a domain you've verified in [Domains](https://delivrie.io/domains), including any subdomain of it. Add a display name in angle-bracket form: `"Acme Support <support@mail.acme.com>"`. If the name has commas or other punctuation, wrap it in quotes: `"\"Acme, Inc.\" <hello@mail.acme.com>"`.

Until your domain is verified, send from `onboarding@delivrie.io` to the [test addresses](/docs/test-mode) and to members of your team.

## Recipients

Each email can have up to 50 addresses in `to`. Everyone in `to` and `cc` sees each other; use `bcc` to hide recipients. To send different content to each person (a receipt per customer, say), send one email each, or up to 100 at a time with [batch sending](#batch-sending).

Addresses on your [suppression list](/docs/suppressions) are skipped automatically. If every recipient is suppressed, the email's status becomes `suppressed` and nothing is sent.

## HTML and plain text

Send `html`, `text`, or both. When you only send `html`, Delivrie builds the plain-text part for you, which helps deliverability. Inline your CSS (most email clients ignore `<style>` blocks), keep the width under about 600px, and use absolute `https://` URLs for images and links.

## Attachments

Attach files as base64 `content`. The total size can be up to 40 MB per email.

```json
"attachments": [
  {
    "filename": "invoice-1042.pdf",
    "content": "JVBERi0xLjcKJc...",
    "content_type": "application/pdf"
  }
]
```

| Field | Notes |
| --- | --- |
| `filename` | Required. Shown to the recipient. |
| `content` | Required. Base64-encoded file. (The Node.js SDK also accepts a `Buffer` or `Uint8Array`.) |
| `content_type` | Optional. Worked out from the filename when you leave it out. |
| `content_id` | Optional. Set it to show the file inline (see below). |

Attachments by URL (`path`) aren't supported yet. Download the file and send its contents instead.

### Inline images

Give the attachment a `content_id` and reference it in your HTML with `cid:`:

```json
{
  "html": "<p>Your QR code:</p><img src=\"cid:qr-1042\" width=\"200\">",
  "attachments": [{ "filename": "qr.png", "content": "iVBORw0KGgo...", "content_id": "qr-1042" }]
}
```

## Tags

Tags label emails so you can find them later and route webhook events. Names and values can use ASCII letters, numbers, `_` and `-`, up to 256 characters each.

```json
"tags": [{ "name": "category", "value": "password_reset" }, { "name": "user_id", "value": "u_8812" }]
```

Tags come back in every webhook event as an object: `"tags": { "category": "password_reset", "user_id": "u_8812" }`.

## Custom headers

```json
"headers": { "X-Order-Id": "1042", "List-Unsubscribe": "<https://acme.com/unsubscribe?u=8812>" }
```

Delivrie builds `From`, `To`, `Cc`, `Bcc`, `Subject`, `Date`, `MIME-Version` and the content headers from your fields, and ignores those names in `headers`. Header values can't contain line breaks.

## Scheduling

Set `scheduled_at` to send later, up to 30 days ahead. It accepts:

- an ISO 8601 date: `"2026-12-01T09:00:00Z"` or `"2026-12-01T10:00:00+01:00"`
- a phrase, read as UTC: `"in 10 minutes"`, `"in 2 hours"`, `"tomorrow at 9am"`

The email gets status `scheduled`. Change the time with `PATCH /emails/:id` and `{ "scheduled_at": "..." }`, or cancel it with `POST /emails/:id/cancel`, any time before it sends. Times less than 30 seconds away send right away.

## Batch sending

`POST /emails/batch` takes an array of up to 100 emails, each with its own recipients and content, and returns their ids in the same order:

```bash
curl -X POST https://delivrie.io/api/emails/batch \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: digest-2026-11-14" \
  -d '[
    { "from": "Acme <hi@mail.acme.com>", "to": "ada@example.com", "subject": "Your digest", "html": "<p>Hi Ada</p>" },
    { "from": "Acme <hi@mail.acme.com>", "to": "sam@example.com", "subject": "Your digest", "html": "<p>Hi Sam</p>" }
  ]'
```

```json
{ "data": [{ "id": "4ef9a417-..." }, { "id": "9a1c22b0-..." }] }
```

Batch emails can't have attachments or `scheduled_at`. If any email in the batch is invalid, the whole batch is rejected and nothing is sent, so you can fix it and retry. To send the same email to a list of subscribers, use [broadcasts](/docs/broadcasts) instead.

## After you send

- Check status in [Emails](https://delivrie.io/emails), or with `GET /emails/:id`, which returns the email and its events. See [Statuses and events](/docs/email-status).
- Get pushed updates with [webhooks](/docs/webhooks).
- If a send fails, the response says why. See [Errors](/docs/errors).
