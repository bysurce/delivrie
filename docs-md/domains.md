# Domains and DNS

Add and verify a sending domain: which DNS records Delivrie needs (DKIM, SPF return path, DMARC, MX for receiving), how to enter them at common DNS providers, tracking and TLS settings.

To send from your own address, add the domain to Delivrie and publish a few DNS records that prove you own it and let mailbox providers trust your mail.

## Use a subdomain

Send from a subdomain such as `mail.acme.com` or `notify.acme.com` rather than `acme.com`. Your app's email then builds its own reputation, and a problem with it can't affect the mail your team sends from `acme.com`. Customers still see whatever `from` name and address you choose, like `Acme <orders@mail.acme.com>`.

## Add the domain

In [Domains](https://delivrie.io/domains/new), enter the domain and click **Add domain**. Or with the API:

```bash
curl -X POST https://delivrie.io/api/domains \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "mail.acme.com" }'
```

The response lists the records to add. Options: `return_path` (bounce subdomain, default `send`), `open_tracking` and `click_tracking` (both off by default). Mail is sent from Ireland (`eu-west-1`).

## The DNS records

For `mail.acme.com`, you'll see records like these:

| Purpose | Type | Name | Value |
| --- | --- | --- | --- |
| DKIM (signs your mail) | `TXT` | `<selector>._domainkey.mail.acme.com` | `p=MIGfMA0GCSq...` (your public key) |
| Return path: bounces | `MX` | `send.mail.acme.com` | `feedback-smtp.eu-west-1.amazonses.com`, priority `10` |
| Return path: SPF | `TXT` | `send.mail.acme.com` | `v=spf1 include:_spf.delivrie.io ~all` |
| DMARC (recommended) | `TXT` | `_dmarc.mail.acme.com` | `v=DMARC1; p=none;` |
| Receiving (optional) | `MX` | `mail.acme.com` or your receiving subdomain | `inbound-smtp.eu-west-1.amazonaws.com`, priority `10` |

The `feedback-smtp...amazonses.com` and `inbound-smtp...amazonaws.com` hosts belong to Delivrie's mail infrastructure. Use the exact values from your dashboard; the DKIM key is unique to your domain. **Copy records as text** in the domain's menu gives you all of them at once.

## Set up automatically on Cloudflare

If your domain's DNS is on Cloudflare, Delivrie can add the records for you:

1. Open the domain and click **Set up with Cloudflare**.
2. Click **Create a Cloudflare token**. Cloudflare opens with the permissions filled in (**Zone: Read** and **DNS: Edit**). Under **Zone Resources**, pick the specific zone for your domain, create the token and copy it.
3. Paste the token and click **Add records**.

Delivrie uses the token once and doesn't keep it, and it's blanked out of your request logs. You can delete the token in Cloudflare afterwards.

Records are only ever **added**. Nothing already in your DNS is changed or deleted:

- A record that's already there with the same value is left as it is.
- If the name already has an SPF record, it's flagged so you can merge ours into it by hand (a name can only have one).
- If the domain already has a DMARC policy, yours is kept.
- If the name already has an MX record from another mail service, it's flagged and left alone, so your existing email keeps working.

You can do the same with the API: `POST /domains/:id/cloudflare` with `{ "api_token": "…" }` returns the domain plus a `cloudflare` object listing the records `created`, `existing` and `skipped` (with the reason).

## Entering records at your DNS provider

Most providers add your root domain to the name automatically. If your DNS zone is `acme.com`, enter only the part before it:

| Full name | What to type in the Name / Host field |
| --- | --- |
| `<selector>._domainkey.mail.acme.com` | `<selector>._domainkey.mail` |
| `send.mail.acme.com` | `send.mail` |
| `_dmarc.mail.acme.com` | `_dmarc.mail` |

Provider notes:

- **Cloudflare:** set every record to **DNS only** (grey cloud). MX and TXT records can't be proxied anyway.
- **GoDaddy, Namecheap, Hostinger:** use the short names above. Namecheap lists MX records under **Mail Settings → Custom MX**.
- **Route 53, Google Cloud DNS:** enter the full name, and wrap TXT values in double quotes.
- **Vercel DNS:** enter the short name; Vercel adds the domain.

## Verify

Click **Verify DNS records** (or `POST /domains/:id/verify`). Each record shows its own status. Most providers update within minutes; some take up to 72 hours. Delivrie also re-checks pending domains in the background and sends a `domain.updated` webhook when the status changes.

Statuses: `not_started` (records not found yet), `pending` (some found), `verified` (ready to send), `failed` or `temporary_failure` (a record was found but is wrong; fix it and verify again).

Stuck? See [Why isn't my domain verifying?](/docs/domain-not-verifying)

## Settings

Change these on the domain's page or with `PATCH /domains/:id`:

| Setting | What it does |
| --- | --- |
| `open_tracking` | Adds an invisible image to count opens. Off by default |
| `click_tracking` | Rewrites links to count clicks. Off by default |
| `tls` | `opportunistic` (default) uses TLS when the receiving server supports it; `enforced` only delivers over TLS |
| `return_path` | The bounce subdomain label, default `send`. Changing it gives you new SPF records to add |

> **Note:** Open tracking is approximate. Apple Mail and some corporate filters load images automatically, which counts as an open even if nobody read the email.

## Several domains, several teams

Each domain belongs to one team. To use the same domain in another team, delete it from the first, or start a **claim** from the other team's Domains page, which proves ownership with a DNS record and moves it.
