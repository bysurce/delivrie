# Auth0

Send Auth0's verification, password reset, welcome, MFA and invitation emails through Delivrie, with a custom email provider Action or over SMTP.

Auth0 sends sign-up verification, password resets, welcome messages, MFA codes and organization invitations. Send them through Delivrie so they come from your own domain and show up in your [logs](https://delivrie.io/logs).

## Option 1: Custom email provider (recommended)

1. In Auth0, open **Branding → Email Provider**, turn on **Use my own email provider** and choose **Custom Provider**.
2. Replace the Action code with this:

```js Custom Email Provider Action
exports.onExecuteCustomEmailProvider = async (event, api) => {
  const n = event.notification;
  const res = await fetch("https://delivrie.io/api/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${event.secrets.DELIVRIE_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `auth0-${n.message_type}-${n.to}-${event.request?.id || ""}`,
    },
    body: JSON.stringify({
      from: event.secrets.DELIVRIE_FROM || n.from,
      to: n.to,
      subject: n.subject,
      html: n.html,
      text: n.text,
      tags: [{ name: "source", value: "auth0" }],
    }),
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  const reason = `Delivrie ${res.status}: ${body.message || ""}`;
  if (res.status === 429 || res.status >= 500) api.notification.retry(reason);
  else api.notification.drop(reason);
};
```

3. Add two secrets to the Action: `DELIVRIE_API_KEY` (a [sending key](https://delivrie.io/api-keys) is enough) and `DELIVRIE_FROM`, a sender on your verified domain like `Acme <auth@mail.acme.com>`.
4. Deploy, then use **Send test email**.

Rate limits and server errors are retried by Auth0; an invalid address is dropped and logged. The full version, with tests, is in [integrations/auth0](https://github.com/bysurce/delivrie/tree/main/integrations/auth0).

## Option 2: SMTP

Choose **SMTP Provider** instead and enter:

| Field | Value |
| --- | --- |
| From | An address on your verified domain |
| Host | `smtp.delivrie.io` |
| Port | `587` |
| Username | `delivrie` |
| Password | Your Delivrie API key |

See [SMTP relay](/docs/smtp) for details.
