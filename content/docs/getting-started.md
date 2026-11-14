---
title: Introduction
group: Get started
order: 1
description: What Delivrie is, how the API works, and where to start: base URL, authentication, SDKs, SMTP and the MCP server.
---
Delivrie is an email platform for developers. Send transactional email (receipts, sign-in codes, password resets) and marketing email (broadcasts, automations) from your own domain, receive replies in an inbox, and get every delivery event as a webhook.

You can reach Delivrie four ways. They all share the same account, limits, logs and webhooks.

| Way in | Use it when | Start here |
| --- | --- | --- |
| REST API | You're writing code in any language | [Quickstart](/docs/quickstart) |
| Node.js SDK | You're on Node.js, Bun, Deno, Workers or Vercel Edge | [Node.js SDK](/docs/sdks) |
| SMTP relay | A framework, CMS or plugin already sends email over SMTP | [SMTP](/docs/smtp) |
| MCP server | An AI assistant should send email or manage your account | [MCP server](/docs/mcp) |

## The API in one minute

- **Base URL:** `https://delivrie.io/api`
- **Authentication:** send your API key in the `Authorization` header: `Authorization: Bearer dlv_your_key`. Create keys in the dashboard under [API keys](https://delivrie.io/api-keys).
- **Format:** JSON in, JSON out. Send `Content-Type: application/json` on requests with a body.
- **Errors:** every error is JSON with `statusCode`, `name` and `message`. See [Errors](/docs/errors).
- **Lists:** list endpoints return `{ "object": "list", "data": [...] }` and take `limit` (1 to 100, default 50) and `offset`. When `has_more` is `true`, ask for the next page with a higher `offset`.
- **Safe retries:** send an `Idempotency-Key` header with every email send. See [Idempotency and retries](/docs/idempotency).
- **Server side only:** never call the API from browser code; your key would be visible to anyone. See [CORS](/docs/cors).

```bash cURL
curl -X POST https://delivrie.io/api/emails \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Acme <onboarding@delivrie.io>",
    "to": "delivered@test.delivrie.io",
    "subject": "Hello from Delivrie",
    "html": "<p>It works!</p>"
  }'
```

```ts Node.js
import { Delivrie } from "delivrie";

const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);
const { data, error } = await delivrie.emails.send({
  from: "Acme <onboarding@delivrie.io>",
  to: "delivered@test.delivrie.io",
  subject: "Hello from Delivrie",
  html: "<p>It works!</p>",
});
```

```python Python
import os, requests

res = requests.post(
    "https://delivrie.io/api/emails",
    headers={"Authorization": f"Bearer {os.environ['DELIVRIE_API_KEY']}"},
    json={
        "from": "Acme <onboarding@delivrie.io>",
        "to": "delivered@test.delivrie.io",
        "subject": "Hello from Delivrie",
        "html": "<p>It works!</p>",
    },
)
print(res.status_code, res.json())
```

`onboarding@delivrie.io` is a shared sender for testing: it can email the [test addresses](/docs/test-mode) and the people on your team. To email anyone else, [verify your own domain](/docs/domains) and send from it.

The response is `{ "id": "<email id>" }`. Delivery happens in the background; follow it in the dashboard under Emails, with `GET /emails/:id`, or with [webhooks](/docs/webhooks).

## Building with an AI coding assistant?

Point it at [delivrie.io/llms.txt](https://delivrie.io/llms.txt). It lists every guide and endpoint as plain Markdown, so Claude, Cursor, Codex, v0 and other tools read the docs directly. [Build with AI](/docs/build-with-ai) has prompts you can paste and a rules file for your project.

## Coming from Resend?

The API uses the same request and response shapes, so most code keeps working. See [Migrate from Resend](/docs/migrate-from-resend).
