# Node.js and Express

Send email from Node.js, Express, Fastify, NestJS or Hono with Delivrie, and verify webhooks with the raw request body.

## Install

```bash
npm install delivrie
```

Set `DELIVRIE_API_KEY` in your environment (a `.env` file loaded with `node --env-file=.env`, or your host's settings).

## Send an email

```js server.js
import express from "express";
import { Delivrie } from "delivrie";

const app = express();
const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);

app.post("/signup", express.json(), async (req, res) => {
  const { email } = req.body;
  // ...create the user...

  const { data, error } = await delivrie.emails.send({
    from: "Acme <hello@mail.acme.com>",
    to: email,
    subject: "Confirm your email",
    html: `<p>Click <a href="https://acme.com/confirm?e=${encodeURIComponent(email)}">here</a> to confirm.</p>`,
  }, { idempotencyKey: `confirm-${email}` });

  if (error) return res.status(502).json({ error: error.message });
  res.json({ ok: true, emailId: data.id });
});

app.listen(3000);
```

## Verify webhooks in Express

Signature checks need the body exactly as it arrived, so use `express.raw` on the webhook route (not `express.json`):

```js server.js
import { verifyWebhook } from "delivrie";

app.post("/webhooks/delivrie", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = await verifyWebhook({
      payload: req.body,          // a Buffer
      headers: req.headers,
      secret: process.env.DELIVRIE_WEBHOOK_SECRET,
    });
    console.log(event.type, event.data.email_id);
    res.sendStatus(200);
  } catch {
    res.sendStatus(400);
  }
});
```

Register any `express.json()` middleware after this route, or only on the routes that need it.

## Other frameworks

The SDK is framework-agnostic. A few notes:

- **Fastify:** add a content-type parser that keeps the raw body for the webhook route (`fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => done(null, body))`).
- **NestJS:** create the client once in a provider and inject it; enable `rawBody: true` in `NestFactory.create` for webhooks.
- **Hono and other fetch-style frameworks:** use `await c.req.text()` as the payload and `c.req.raw.headers` as the headers.

## Without the SDK

Any HTTP client works:

```js
const res = await fetch("https://delivrie.io/api/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.DELIVRIE_API_KEY}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "order-1042-receipt",
  },
  body: JSON.stringify({ from: "Acme <orders@mail.acme.com>", to: "ada@example.com", subject: "Receipt", html: "<p>Thanks!</p>" }),
});
const body = await res.json();
if (!res.ok) throw new Error(`${body.name}: ${body.message}`);
```

## Nodemailer

Already using Nodemailer? Point it at the [SMTP relay](/docs/smtp) instead:

```js
import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: "smtp.delivrie.io",
  port: 587,
  secure: false, // STARTTLS
  auth: { user: "delivrie", pass: process.env.DELIVRIE_API_KEY },
});

await transport.sendMail({ from: "Acme <hello@mail.acme.com>", to: "ada@example.com", subject: "Hi", text: "Hello" });
```
