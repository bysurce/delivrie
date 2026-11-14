# CORS and browser apps

Why you shouldn't call the Delivrie API from the browser, and how to send email from React, Vue, mobile and no-code front ends through a small server route instead.

If you call `https://delivrie.io/api` from code that runs in a browser or mobile app, anyone can open developer tools, copy your API key and send email as you. So keep the key on a server.

## Send through a server route

Put the API call in code you control on the server, and have your front end call that:

```ts app/api/contact/route.ts (Next.js)
import { Delivrie } from "delivrie";

const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);

export async function POST(req: Request) {
  const { email, message } = await req.json();
  if (!email || !message) return Response.json({ error: "Missing fields" }, { status: 400 });

  const { error } = await delivrie.emails.send({
    from: "Website <forms@mail.acme.com>",
    to: "team@acme.com",
    replyTo: email,
    subject: "New message from the website",
    text: message,
  });
  return error ? Response.json({ error: error.message }, { status: 502 }) : Response.json({ ok: true });
}
```

```ts Front end
await fetch("/api/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, message }),
});
```

Good places for that server code: a Next.js route handler or Server Action, a [Supabase Edge Function](/docs/supabase), a [Cloudflare Worker](/docs/cloudflare-workers), a Vercel or Netlify function, Firebase Cloud Functions, or your own backend.

## Protect the route

A public route that sends email can be abused too. Before sending:

- Send to fixed addresses you control (like your team inbox) rather than an address from the request, or only to the signed-in user's own address.
- Rate-limit by IP or user.
- Add a CAPTCHA (Turnstile, hCaptcha or reCAPTCHA) to public forms.
- Use a [sending access key](/docs/api-keys) limited to one domain.

## No-code and AI app builders

Lovable, Bolt, v0, Replit and similar tools can generate the server route for you. Ask them to "send email from a server function using the Delivrie API, reading DELIVRIE_API_KEY from secrets, never from the browser". See [Build with AI](/docs/build-with-ai) for prompts.
