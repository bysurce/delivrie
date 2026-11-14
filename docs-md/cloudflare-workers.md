# Cloudflare Workers

Send email from Cloudflare Workers, Pages Functions, Deno and Bun with the Delivrie SDK, which runs on web-standard APIs with no Node.js dependencies.

The `delivrie` SDK uses only `fetch` and Web Crypto, so it runs in Workers without the `nodejs_compat` flag.

```bash
npm install delivrie
npx wrangler secret put DELIVRIE_API_KEY
```

```ts src/index.ts
import { Delivrie, verifyWebhook } from "delivrie";

interface Env {
  DELIVRIE_API_KEY: string;
  DELIVRIE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const delivrie = new Delivrie(env.DELIVRIE_API_KEY); // Workers have no process.env: pass the key

    if (url.pathname === "/send" && req.method === "POST") {
      const { email } = await req.json<{ email: string }>();
      const { data, error } = await delivrie.emails.send({
        from: "Acme <hello@mail.acme.com>",
        to: email,
        subject: "Hello from the edge",
        html: "<p>Sent from a Cloudflare Worker.</p>",
      });
      return error ? Response.json(error, { status: 502 }) : Response.json(data);
    }

    if (url.pathname === "/webhooks/delivrie" && req.method === "POST") {
      try {
        const event = await verifyWebhook({ payload: await req.text(), headers: req.headers, secret: env.DELIVRIE_WEBHOOK_SECRET });
        console.log(event.type);
        return new Response("ok");
      } catch {
        return new Response("invalid signature", { status: 400 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
```

## Deno and Bun

```ts Deno
import { Delivrie } from "npm:delivrie";
const delivrie = new Delivrie(Deno.env.get("DELIVRIE_API_KEY"));
```

```ts Bun
import { Delivrie } from "delivrie"; // bun add delivrie
const delivrie = new Delivrie(); // reads DELIVRIE_API_KEY from the environment
```

## Vercel Edge and Netlify Edge

Vercel's Edge runtime exposes `process.env`, so `new Delivrie()` picks up `DELIVRIE_API_KEY` from your project settings. On Netlify Edge Functions, pass the key yourself: `new Delivrie(Netlify.env.get("DELIVRIE_API_KEY"))`.
