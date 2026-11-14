# Supabase

Use Delivrie with Supabase: send Supabase Auth emails (sign-up, magic links, password resets) through custom SMTP, and send app email from Edge Functions.

## Send Supabase Auth emails through Delivrie

Supabase's built-in email service is rate-limited and meant for testing. Point Auth at the [SMTP relay](/docs/smtp) so confirmation, magic-link and password-reset emails come from your own domain:

1. In the Supabase dashboard, open **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**.
2. Fill in:

| Field | Value |
| --- | --- |
| Sender email | An address on your verified domain, like `auth@mail.acme.com` |
| Sender name | Your app's name |
| Host | `smtp.delivrie.io` |
| Port | `587` (or `465`) |
| Username | `delivrie` |
| Password | A Delivrie API key (a sending access key is enough) |

3. Save, then raise the email rate limit under **Authentication → Rate Limits** to suit your app.

Every Auth email then shows up in [Emails](https://delivrie.io/emails) with its delivery status.

## Send from an Edge Function

```ts supabase/functions/send-welcome/index.ts
import { Delivrie } from "npm:delivrie";

const delivrie = new Delivrie(Deno.env.get("DELIVRIE_API_KEY"));

Deno.serve(async (req) => {
  const { email, name } = await req.json();
  const { data, error } = await delivrie.emails.send({
    from: "Acme <hello@mail.acme.com>",
    to: email,
    subject: `Welcome, ${name}`,
    html: `<p>Thanks for joining Acme.</p>`,
  }, { idempotencyKey: `welcome-${email}` });

  if (error) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ id: data.id });
});
```

Set the secret and deploy:

```bash
supabase secrets set DELIVRIE_API_KEY=dlv_your_key
supabase functions deploy send-welcome
```

## Send when a row changes

To email users when something happens in your database (a new order, say), create a Database Webhook in **Database → Webhooks** that calls your Edge Function on `INSERT`. The function receives `{ type, table, record }` and sends the email with `record` fields.

## Webhooks into Supabase

Receive Delivrie events in an Edge Function with `verifyWebhook` from `npm:delivrie`, then write bounces or opens to a table. Deploy it with `--no-verify-jwt`, because Delivrie authenticates with its signature rather than a Supabase JWT:

```bash
supabase functions deploy delivrie-webhooks --no-verify-jwt
```
