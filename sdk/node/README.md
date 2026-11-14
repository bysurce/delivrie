# Delivrie for Node.js

The official TypeScript SDK for the [Delivrie](https://delivrie.io) email API. It uses only web-standard APIs (`fetch`, Web Crypto), so the same package runs on Node.js 18+, Bun, Deno, Cloudflare Workers and Vercel Edge. No dependencies.

```bash
npm install delivrie
```

## Send an email

```ts
import { Delivrie } from "delivrie";

const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);

const { data, error } = await delivrie.emails.send({
  from: "Kora <orders@mail.kora.ng>",
  to: "ada@example.com",
  subject: "Your order is on its way",
  html: "<p>Thanks for your order!</p>",
});

if (error) console.error(error.name, error.message);
else console.log("Sent", data.id);
```

Create an API key at [delivrie.io/api-keys](https://delivrie.io/api-keys). If you leave out the key, the SDK reads `DELIVRIE_API_KEY` from the environment. Never use your key in browser code: call Delivrie from your server or an edge function.

CommonJS works too:

```js
const Delivrie = require("delivrie");
const delivrie = new Delivrie("dlv_...");
```

## Results and errors

Every call resolves to `{ data, error }`, and exactly one of them is `null`. API errors never throw, so you don't need `try`/`catch`:

```ts
const { error } = await delivrie.domains.get("dom_123");
if (error?.name === "not_found") { /* ... */ }
```

`error` has `statusCode`, `name` and `message`, matching the [API's errors](https://delivrie.io/docs/errors). Network problems and timeouts come back with `statusCode: 0` and the name `network_error` or `timeout`.

## Retries and idempotency

Reads and deletes are retried up to twice on server errors and network failures, with backoff. Sends are only retried when you pass an idempotency key, so a retry can never send the same email twice:

```ts
await delivrie.emails.send(email, { idempotencyKey: `order-${order.id}` });
```

Change the defaults with `new Delivrie(key, { maxRetries: 0, timeout: 10_000 })`.

## More examples

```ts
// Attachments: pass a base64 string, a Buffer or a Uint8Array
await delivrie.emails.send({
  from: "billing@mail.kora.ng",
  to: ["ada@example.com"],
  subject: "Invoice",
  text: "Your invoice is attached.",
  attachments: [{ filename: "invoice.pdf", content: await readFile("invoice.pdf") }],
});

// A published template, scheduled for later
await delivrie.emails.send({
  from: "hello@mail.kora.ng",
  to: "ada@example.com",
  template: { id: "welcome", variables: { first_name: "Ada" } },
  scheduledAt: "tomorrow at 9am",
});

// Up to 100 emails in one request
await delivrie.emails.batch([{ ... }, { ... }]);

// Domains, contacts, broadcasts
await delivrie.domains.create({ name: "mail.kora.ng" });
await delivrie.contacts.create({ email: "ada@example.com", first_name: "Ada" });
await delivrie.broadcasts.send("bc_123", { scheduled_at: "in 1 hour" });

// Start automations listening for an event
await delivrie.events.send({ event: "user.signed_up", email: "ada@example.com", data: { plan: "starter" } });
```

The client covers `emails`, `domains`, `apiKeys`, `webhooks`, `contacts`, `segments`, `topics`, `contactProperties`, `broadcasts`, `templates`, `suppressions`, `events`, `automations`, `inbox`, `metrics`, `logs` and `usage`. For anything else, `delivrie.request(method, path, body)` calls the API directly.

## Verify webhooks

Delivrie signs webhooks with the [Standard Webhooks](https://www.standardwebhooks.com) scheme. Check the signature against the raw body, before parsing it:

```ts
import { verifyWebhook } from "delivrie";

// Next.js route handler, Hono, Workers, etc.
export async function POST(req: Request) {
  try {
    const event = await verifyWebhook({
      payload: await req.text(),
      headers: req.headers,
      secret: process.env.DELIVRIE_WEBHOOK_SECRET!, // whsec_...
    });
    if (event.type === "email.bounced") { /* ... */ }
    return new Response("ok");
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
}
```

With Express, use `express.raw({ type: "application/json" })` on the route and pass `req.body` and `req.headers`.

## Links

- [Docs](https://delivrie.io/docs)
- [API reference](https://delivrie.io/docs/api)
- [Changelog](https://delivrie.io/docs/changelog)

MIT licensed.
