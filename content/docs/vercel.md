---
title: Vercel
group: Integrations
order: 6
description: Add Delivrie to your Vercel projects: the integration creates an API key and sets DELIVRIE_API_KEY on the projects you choose, for production, preview and development.
---
## Connect from Vercel

1. Add the **Delivrie** integration from Vercel's integrations page and choose the Vercel team.
2. Vercel brings you to Delivrie. Sign in, pick the Delivrie team, then choose the Vercel projects that send email.
3. Choose **Sending only** (recommended) or **Full access**, and select **Connect**.

Delivrie creates an API key and adds it to each project as `DELIVRIE_API_KEY`, encrypted, for production, preview and development. Redeploy, and your code can read it:

```ts app/api/welcome/route.ts
import { Delivrie } from "delivrie";

const delivrie = new Delivrie(); // reads DELIVRIE_API_KEY

export async function POST(req: Request) {
  const { email } = await req.json();
  const { data, error } = await delivrie.emails.send({
    from: "Acme <hello@mail.acme.com>",
    to: email,
    subject: "Welcome to Acme",
    html: "<p>Thanks for signing up.</p>",
  }, { idempotencyKey: `welcome-${email}` });
  return Response.json(error ?? data, { status: error ? 400 : 200 });
}
```

## Disconnect

Remove the integration in Vercel, or in Delivrie under [Settings → Integrations](https://delivrie.io/settings/integrations). Delivrie deletes the API key and removes `DELIVRIE_API_KEY` from the projects.

## Without the integration

Create a key in [API keys](https://delivrie.io/api-keys) and add it yourself: `vercel env add DELIVRIE_API_KEY`. See [Next.js](/docs/nextjs) for complete examples.
