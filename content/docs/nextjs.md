---
title: Next.js
group: SDKs and frameworks
order: 2
description: Send email from Next.js with Delivrie: App Router route handlers, Server Actions, React Email templates, webhooks and deploying on Vercel.
---
Send from server code only: route handlers, Server Actions or `getServerSideProps`. Never from client components, because the API key would ship to the browser.

## 1. Install and add your key

```bash
npm install delivrie
```

```bash .env.local
DELIVRIE_API_KEY=dlv_your_key
```

On Vercel, add the same variable under **Project → Settings → Environment Variables**. Don't prefix it with `NEXT_PUBLIC_`, which would expose it to the browser.

Create one client to share:

```ts lib/delivrie.ts
import { Delivrie } from "delivrie";

export const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);
```

## 2a. Send from a route handler

```ts app/api/send/route.ts
import { delivrie } from "@/lib/delivrie";

export async function POST(req: Request) {
  const { email, name } = await req.json();

  const { data, error } = await delivrie.emails.send({
    from: "Acme <hello@mail.acme.com>",
    to: email,
    subject: `Welcome to Acme, ${name}`,
    html: `<p>Hi ${name}, thanks for signing up.</p>`,
  }, { idempotencyKey: `welcome-${email}` });

  if (error) return Response.json({ error: error.message }, { status: error.statusCode || 500 });
  return Response.json({ id: data.id });
}
```

> **Warning:** Escape anything users type before putting it in `html`, or use React Email (below), which escapes for you.

## 2b. Or from a Server Action

```tsx app/contact/page.tsx
import { delivrie } from "@/lib/delivrie";

async function sendMessage(formData: FormData) {
  "use server";
  const { error } = await delivrie.emails.send({
    from: "Website <forms@mail.acme.com>",
    to: "team@acme.com",
    replyTo: String(formData.get("email")),
    subject: "New contact form message",
    text: String(formData.get("message")),
  });
  if (error) throw new Error(error.message);
}

export default function Page() {
  return (
    <form action={sendMessage}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      <button type="submit">Send</button>
    </form>
  );
}
```

## React Email

Build templates as React components with [React Email](https://react.email) and render them to HTML:

```bash
npm install @react-email/components @react-email/render
```

```tsx emails/welcome.tsx
import { Html, Body, Heading, Text, Button } from "@react-email/components";

export default function Welcome({ name }: { name: string }) {
  return (
    <Html>
      <Body style={{ fontFamily: "sans-serif" }}>
        <Heading>Welcome, {name}</Heading>
        <Text>Thanks for joining Acme.</Text>
        <Button href="https://acme.com/start">Get started</Button>
      </Body>
    </Html>
  );
}
```

```ts app/api/send/route.ts
import { render } from "@react-email/render";
import Welcome from "@/emails/welcome";
import { delivrie } from "@/lib/delivrie";

const html = await render(Welcome({ name: "Ada" }));
await delivrie.emails.send({ from: "Acme <hello@mail.acme.com>", to: "ada@example.com", subject: "Welcome", html });
```

Delivrie creates the plain-text version from your HTML automatically.

## Receive webhooks

```ts app/api/webhooks/delivrie/route.ts
import { verifyWebhook } from "delivrie";

export async function POST(req: Request) {
  let event;
  try {
    event = await verifyWebhook({
      payload: await req.text(),
      headers: req.headers,
      secret: process.env.DELIVRIE_WEBHOOK_SECRET!,
    });
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "email.bounced" || event.type === "email.complained") {
    // mark event.data.to as undeliverable in your database
  }
  return new Response("ok");
}
```

Add the endpoint in [Webhooks](https://delivrie.io/webhooks) as `https://your-app.com/api/webhooks/delivrie` and copy its signing secret into `DELIVRIE_WEBHOOK_SECRET`.

## Edge runtime

The SDK works on the Edge runtime without changes: add `export const runtime = "edge"` to the route file.

## Common problems

- **`Missing API key`:** the variable isn't set in this environment. Check `.env.local` locally and the Vercel project settings for Preview and Production, then redeploy.
- **It works locally but not on Vercel:** environment variables apply to new deployments only. Redeploy after adding them.
- **`422` saying the from domain isn't verified:** use a sender on a domain verified in [Domains](https://delivrie.io/domains), or `onboarding@delivrie.io` while testing.
