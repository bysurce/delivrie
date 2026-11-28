---
name: email-webhooks
description: Receive Delivrie webhooks (delivered, bounced, complained, opened, clicked, received mail, inbox and broadcast events) and verify their signatures. Use when the user wants to react to email events or incoming mail.
---
# Delivrie webhooks

Reference: https://delivrie.io/docs/webhooks.md

1. Add an endpoint like `POST /api/webhooks/delivrie`. Read the **raw** request body before any JSON parsing: the signature covers the exact bytes.
2. Verify with the SDK: `verifyWebhook({ payload, headers, secret })` (Node), `Webhook.verify(...)` (Python, PHP, Ruby, Java, .NET), `delivrie.VerifyWebhook` (Go), `delivrie::webhook::verify` (Rust). The secret is `DELIVRIE_WEBHOOK_SECRET` (starts with `whsec_`). Without an SDK: Standard Webhooks, HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${body}` with the base64-decoded secret, compared in constant time against each `v1,<base64>` in `webhook-signature`; reject timestamps more than 5 minutes off.
3. Return 2xx quickly (do slow work in a job) and 400 for a bad signature. Deliveries are retried, so make handlers idempotent on `webhook-id`.
4. Create the endpoint in the dashboard (https://delivrie.io/webhooks) or with the `create_webhook` MCP tool, choosing only the events you handle. Test it with `test_webhook`.

Common events: `email.delivered`, `email.bounced` and `email.complained` (stop emailing that address), `email.received` (incoming mail, with attachment metadata; download files with `GET /emails/received/:id/attachments`), `inbox.email.received`, `broadcast.sent`, `contact.import.completed`.
