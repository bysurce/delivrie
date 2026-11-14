# SMTP

Send through Delivrie's SMTP relay from WordPress, Laravel, Django, Rails, Ghost, Supabase Auth, Nodemailer and anything else that speaks SMTP.

Anything that can send over SMTP can send through Delivrie: CMSs, frameworks, no-code tools, printers and legacy apps. SMTP mail gets the same limits, logs, webhooks and suppressions as the API.

## Settings

| Setting | Value |
| --- | --- |
| Host | `smtp.delivrie.io` |
| Port | `587` with STARTTLS, or `465` with SSL/TLS |
| Alternative ports | `2587` (STARTTLS) and `2465` (SSL/TLS), for hosts that block the usual ones |
| Username | `delivrie` |
| Password | A Delivrie API key (`dlv_...`). A sending access key is enough |
| Encryption | Required. On 587 choose STARTTLS (sometimes called TLS); on 465 choose SSL/TLS (sometimes called SSL or SMTPS) |

The `From` address must be on a verified domain, the same as with the API.

## Examples

```js Nodemailer
const transport = nodemailer.createTransport({
  host: "smtp.delivrie.io",
  port: 587,
  secure: false, // upgrades with STARTTLS
  auth: { user: "delivrie", pass: process.env.DELIVRIE_API_KEY },
});
```

```bash Laravel .env
MAIL_MAILER=smtp
MAIL_HOST=smtp.delivrie.io
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=delivrie
MAIL_PASSWORD=dlv_your_key
```

```python Django
EMAIL_HOST = "smtp.delivrie.io"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = "delivrie"
EMAIL_HOST_PASSWORD = os.environ["DELIVRIE_API_KEY"]
```

```ruby Rails
config.action_mailer.smtp_settings = {
  address: "smtp.delivrie.io", port: 587, user_name: "delivrie",
  password: ENV.fetch("DELIVRIE_API_KEY"), authentication: :plain, enable_starttls_auto: true,
}
```

```bash swaks (testing)
swaks --server smtp.delivrie.io:587 --tls \
  --auth-user delivrie --auth-password "$DELIVRIE_API_KEY" \
  --from hello@mail.acme.com --to delivered@test.delivrie.io
```

Step-by-step setup for [Supabase Auth](/docs/supabase), [WordPress and Laravel](/docs/php), [Django](/docs/python) and [Rails](/docs/ruby) is in their guides.

## What's supported

- To, Cc and Bcc come from the message and the SMTP envelope.
- Attachments are kept, up to 40 MB per message.
- Custom `X-` headers and `List-Unsubscribe` are passed through.
- Tag a message with an `X-Delivrie-Tags` header: `X-Delivrie-Tags: source=wordpress, order`. Tags appear in the dashboard and in webhook events.
- Each message is sent once even if your app retries, based on its `Message-ID`.

## SMTP replies

| Reply | Meaning | What to do |
| --- | --- | --- |
| `535` | Authentication failed | The username must be `delivrie` and the password a valid API key |
| `550` | The API rejected the message | The reply says why, for example an unverified From domain |
| `452` | A sending limit was reached | Retry later, or check your plan in [Billing](https://delivrie.io/billing) |

After five failed logins from one IP address, logins from that address are blocked for 15 minutes.

## Troubleshooting connections

- **Timeouts:** some hosts (DigitalOcean, Google Cloud, some home ISPs) block outbound ports 25, 465 and 587. Use port `2587` or `2465`.
- **TLS errors on 465:** your client is trying STARTTLS on an SSL port. Choose SSL/TLS, or switch to 587.
- **"Must issue a STARTTLS command first":** turn on encryption. Plain-text logins aren't accepted.
