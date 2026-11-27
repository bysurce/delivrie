# Webhooks

Get Delivrie events (sent, delivered, bounced, complained, opened, clicked, received, contact and domain changes) pushed to your server, with payload examples, signature verification in every language, retries and replays.

Webhooks push events to your server as they happen, so you don't have to poll. Use them to mark bounced addresses, record deliveries, react to replies and keep your own history.

## Add an endpoint

In [Webhooks](https://delivrie.io/webhooks), click **Add endpoint**, enter an `https://` URL and choose events. Or with the API:

```bash
curl -X POST https://delivrie.io/api/webhooks \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "endpoint": "https://acme.com/webhooks/delivrie", "events": ["email.delivered", "email.bounced", "email.complained"] }'
```

The response includes `signing_secret` (starts with `whsec_`). It's shown once: store it as `DELIVRIE_WEBHOOK_SECRET`. Use `["*"]` to receive every event.

## Events

| Event | When |
| --- | --- |
| `email.sent` | Delivrie's mail servers accepted the email |
| `email.delivered` | The recipient's server accepted it |
| `email.delivery_delayed` | Delivery is temporarily failing and being retried |
| `email.bounced` | The recipient's server rejected it |
| `email.complained` | The recipient marked it as spam |
| `email.opened` | Opened (open tracking must be on for the domain) |
| `email.clicked` | A link was clicked (click tracking must be on) |
| `email.failed` | It couldn't be sent; `failed.reason` says why |
| `email.received` | Mail arrived at one of your [receiving](/docs/receiving) addresses |
| `contact.created`, `contact.updated`, `contact.deleted` | A contact changed |
| `domain.created`, `domain.updated` | A domain was added or its verification status changed |

## Payloads

Every request is a `POST` with a JSON body of `{ type, created_at, data }`.

```json email.delivered
{
  "type": "email.delivered",
  "created_at": "2026-11-14T09:12:06.511Z",
  "data": {
    "email_id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    "from": "Acme <orders@mail.acme.com>",
    "to": ["ada@example.com"],
    "subject": "Your order is confirmed",
    "created_at": "2026-11-14T09:12:04.120Z",
    "tags": { "category": "receipt" }
  }
}
```

```json email.bounced
{
  "type": "email.bounced",
  "created_at": "2026-11-14T09:12:07.002Z",
  "data": {
    "email_id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    "from": "Acme <orders@mail.acme.com>",
    "to": ["nobody@example.com"],
    "subject": "Your order is confirmed",
    "created_at": "2026-11-14T09:12:04.120Z",
    "bounce": {
      "type": "Permanent",
      "sub_type": "General",
      "message": "smtp; 550 5.1.1 user unknown",
      "recipients": [{ "emailAddress": "nobody@example.com" }]
    }
  }
}
```

```json email.clicked
{
  "type": "email.clicked",
  "created_at": "2026-11-14T09:30:12.000Z",
  "data": {
    "email_id": "4ef9a417-...",
    "from": "Acme <orders@mail.acme.com>",
    "to": ["ada@example.com"],
    "subject": "Your order is confirmed",
    "created_at": "2026-11-14T09:12:04.120Z",
    "click": { "link": "https://acme.com/orders/1042", "user_agent": "Mozilla/5.0 ...", "ip": "102.89.0.1" }
  }
}
```

```json contact.created
{
  "type": "contact.created",
  "created_at": "2026-11-14T08:00:00.000Z",
  "data": { "id": "c_12...", "email": "ada@example.com", "first_name": "Ada", "last_name": "Lovelace", "unsubscribed": false, "created_at": "2026-11-14T08:00:00.000Z" }
}
```

```json domain.updated
{
  "type": "domain.updated",
  "created_at": "2026-11-14T08:05:00.000Z",
  "data": { "id": "d91e...", "name": "mail.acme.com", "status": "verified", "region": "eu-west-1" }
}
```

All email events share `email_id`, `from`, `to`, `subject` and `created_at`, plus `tags` (as an object) when the email had tags and `broadcast_id` for broadcast emails. `email.bounced` adds `bounce`, `email.clicked` adds `click`, `email.failed` adds `failed: { reason }`. The `email.received` payload is shown in [Receiving email](/docs/receiving).

## Verify signatures

Every request is signed with the [Standard Webhooks](https://www.standardwebhooks.com) scheme, using three headers:

| Header | Contains |
| --- | --- |
| `webhook-id` | A unique event id, like `evt_8c1...`. The same for retries of one event |
| `webhook-timestamp` | Unix time in seconds when this attempt was sent |
| `webhook-signature` | `v1,<base64 signature>` (several, space-separated, during secret rotation) |

The signature is HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${raw body}`, keyed with the base64-decoded part of your secret after `whsec_`. Always verify against the **raw** body, before any JSON parsing, and reject timestamps more than five minutes old.

```ts Node.js
import { verifyWebhook } from "delivrie";

// Next.js route handler, Hono, Workers... (Express: use express.raw and pass req.body)
export async function POST(req: Request) {
  try {
    const event = await verifyWebhook({
      payload: await req.text(),
      headers: req.headers,
      secret: process.env.DELIVRIE_WEBHOOK_SECRET!,
    });
    await handle(event);
    return new Response("ok");
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
}
```

```python Python
from delivrie import verify_webhook, WebhookVerificationError

# Flask; in Django pass request.body, in FastAPI await request.body()
try:
    event = verify_webhook(request.get_data(), request.headers, os.environ["DELIVRIE_WEBHOOK_SECRET"])
except WebhookVerificationError:
    return "", 400
```

```go Go
body, _ := io.ReadAll(r.Body)
event, err := delivrie.VerifyWebhook(body, r.Header, os.Getenv("DELIVRIE_WEBHOOK_SECRET"))
if err != nil {
	http.Error(w, "invalid signature", http.StatusBadRequest)
	return
}
```

```php PHP
try {
    $event = \Delivrie\Webhook::verify(file_get_contents('php://input'), getallheaders(), getenv('DELIVRIE_WEBHOOK_SECRET'));
} catch (\Delivrie\Exception\WebhookVerificationException $e) {
    http_response_code(400);
    exit;
}
```

Each SDK checks the signature and the timestamp and returns the parsed event.

No SDK in your language? The [Ruby](/docs/ruby) and [Rust](/docs/rust) guides show the check written by hand, and Standard Webhooks libraries (`standardwebhooks` on npm and PyPI, and others) also work with your `whsec_` secret.

## Respond quickly

Return any `2xx` status within 15 seconds. Do slow work (database writes, calling other APIs) in a background job after responding. Redirects aren't followed and count as failures.

## Retries

Failed deliveries (non-`2xx`, timeout, connection error) are retried with increasing gaps: after about 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, then every 10 hours, for up to 72 hours.

- Events can arrive more than once and out of order. Use `webhook-id` to skip duplicates, and `created_at` to order them.
- See every attempt, with the status code and response, on the endpoint's page in [Webhooks](https://delivrie.io/webhooks) or with `GET /webhooks/:id/events`.
- Resend any attempt with **Replay** or `POST /webhook-deliveries/:id/replay`.
- Check your endpoint with **Send test event** or `POST /webhooks/:id/test`.

## Test locally

Expose your local server with a tunnel such as `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`, add the tunnel URL as an endpoint, then send to a [test address](/docs/test-mode) to trigger real events.
