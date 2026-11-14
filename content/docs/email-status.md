---
title: Statuses and events
group: Sending
order: 5
description: What each email status means (queued, sent, delivered, bounced, complained and more), how to read an email's event history, and how statuses map to webhook events.
---
Every email has a status (`last_event` in the API) and a history of events. Check them in [Emails](https://delivrie.io/emails), with `GET /emails/:id`, or as they happen with [webhooks](/docs/webhooks).

## Statuses

| Status | Meaning | Final? |
| --- | --- | --- |
| `scheduled` | Waiting for its `scheduled_at` time | No |
| `queued` | Accepted and about to be handed to the mail servers | No |
| `sent` | Delivrie's mail servers accepted it and are delivering it | No |
| `delivery_delayed` | The recipient's server is temporarily refusing it; Delivrie keeps retrying | No |
| `delivered` | The recipient's mail server accepted it | Yes, unless opened or clicked later |
| `opened` | The recipient opened it (needs open tracking on the domain) | |
| `clicked` | The recipient clicked a link (needs click tracking on the domain) | |
| `bounced` | The recipient's server rejected it | Yes |
| `complained` | The recipient marked it as spam | Yes |
| `failed` | It couldn't be sent, for example because the domain stopped being verified. `error` says why | Yes |
| `canceled` | A scheduled email you canceled | Yes |
| `suppressed` | Every recipient was on your [suppression list](/docs/suppressions), so nothing was sent | Yes |

`delivered` means the receiving server accepted the message. Whether it lands in the inbox or spam folder is up to the receiving provider; the [Deliverability guide](/docs/deliverability) covers how to stay in the inbox.

## Event history

`GET /emails/:id` returns the email with every event:

```json
{
  "object": "email",
  "id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
  "from": "Acme <orders@mail.acme.com>",
  "to": ["ada@example.com"],
  "subject": "Your order is confirmed",
  "last_event": "delivered",
  "created_at": "2026-11-14T09:12:04Z",
  "events": [
    { "type": "sent", "data": { "message_id": "0102019..." }, "created_at": "2026-11-14T09:12:05Z" },
    { "type": "delivered", "data": { "smtp_response": "250 2.0.0 OK", "latency_ms": 812 }, "created_at": "2026-11-14T09:12:06Z" }
  ]
}
```

Bounce events include the type (`Permanent` or `Transient`), the sub-type and the receiving server's message, which usually says exactly why: a mailbox that doesn't exist, a full inbox, or a blocked sender.

## Bounces and complaints

- A **permanent bounce** (the address doesn't exist) adds the address to your suppression list, so you don't send to it again.
- A **transient bounce** (mailbox full, server busy) doesn't suppress the address.
- A **complaint** suppresses the address and unsubscribes the contact from broadcasts.

## Webhook events

| Status | Webhook event |
| --- | --- |
| `sent` | `email.sent` |
| `delivered` | `email.delivered` |
| `delivery_delayed` | `email.delivery_delayed` |
| `opened` | `email.opened` |
| `clicked` | `email.clicked` |
| `bounced` | `email.bounced` |
| `complained` | `email.complained` |
| `failed` | `email.failed` |

## Retention

After 30 days, an email's HTML, text and attachments are deleted. Its recipients, subject, status and events stay, so logs and metrics keep working.

Email content is kept for 30 days on every plan, for both sent and received email. Enterprise plans can keep it longer.

Use webhooks to keep your own copy if you need it longer.
