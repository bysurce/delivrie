# Idempotency and retries

Make email sends safe to retry with the Idempotency-Key header, choose good keys, and know which errors to retry.

Networks fail. If your request times out, you can't tell whether the email went out. Send an `Idempotency-Key` header, and retrying with the same key returns the original email instead of sending a second one.

```bash
curl -X POST https://delivrie.io/api/emails \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042-receipt" \
  -d '{ "from": "Acme <orders@mail.acme.com>", "to": "ada@example.com", "subject": "Receipt", "html": "<p>Thanks!</p>" }'
```

The first request sends the email and returns `{ "id": "..." }`. Every later request with the same key, from the same team, returns the same `id` and sends nothing, even if the body changed.

## Choosing keys

Build the key from the business event the email belongs to, not from a random value made at send time:

| Email | Good key |
| --- | --- |
| Order receipt | `order-1042-receipt` |
| Welcome email | `welcome-user-8812` |
| Password reset | `reset-8812-2026-11-14T10:05` (one per reset request) |
| Weekly digest | `digest-user-8812-2026-w46` |

Keep keys under 256 characters. They're kept with the email, so the same key never sends twice for your team, however much later you retry. Use a new key when you really do want to send again.

Batch sends take one key for the whole batch (`POST /emails/batch` with `Idempotency-Key: digest-2026-11-14`). Retrying the batch returns the same ids in the same order.

## When to retry

| Response | What to do |
| --- | --- |
| `2xx` | Done. |
| Network error or timeout | Retry with the same key, with backoff (1s, 2s, 4s...). |
| `5xx` | Retry with the same key, with backoff. |
| `429` with `daily_quota_exceeded`, `monthly_quota_exceeded` or `spending_cap_reached` | Don't retry. It won't succeed until the limit resets or your plan changes. Alert someone. |
| `4xx` (anything else) | Don't retry. Fix the request; the `message` says what's wrong. |

The [Node.js SDK](/docs/sdks) does this for you: pass `idempotencyKey` and it retries network errors and `5xx` responses up to twice. Without a key, it never retries a send.

## Queues and background jobs

If you send from a job queue (BullMQ, Sidekiq, Celery, Laravel queues, Inngest, Trigger.dev), derive the key from the job's identity, not the attempt. The queue can then retry the job freely and the customer still gets one email.

```ts
worker.process("send-receipt", async (job) => {
  const { error } = await delivrie.emails.send(receiptFor(job.data.orderId), {
    idempotencyKey: `order-${job.data.orderId}-receipt`,
  });
  if (error && error.statusCode >= 500) throw new Error(error.message); // let the queue retry
});
```

## SMTP

Messages sent through the [SMTP relay](/docs/smtp) are deduplicated by their `Message-ID` header, so an app that retries an SMTP send doesn't send twice.
