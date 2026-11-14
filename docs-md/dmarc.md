# DMARC

Set up DMARC for your sending domain, roll it out safely from p=none to p=reject, and meet Gmail and Yahoo's bulk sender requirements.

DMARC tells mailbox providers what to do with mail that claims to be from your domain but fails SPF and DKIM checks, and where to send reports about it. Gmail, Yahoo and Microsoft require it for bulk senders, and it helps everyone else reach the inbox.

## Add the record

Add a `TXT` record at `_dmarc` on your sending domain (for `mail.acme.com`, the name is `_dmarc.mail.acme.com`):

```text
v=DMARC1; p=none; rua=mailto:dmarc-reports@acme.com
```

| Tag | Meaning |
| --- | --- |
| `p` | Policy: `none` (monitor only), `quarantine` (send failures to spam) or `reject` (block failures) |
| `rua` | Where providers send daily aggregate reports |
| `pct` | Optional: apply the policy to this percentage of failing mail, for gradual rollout |

If your root domain (`acme.com`) already has a DMARC record, it covers subdomains too, unless the subdomain has its own.

## Roll it out

1. Start with `p=none` and collect reports for two to four weeks. A free report reader (Postmark's DMARC tool, dmarcian, EasyDMARC) turns the XML into something readable.
2. Check that everything sending as your domain passes: Delivrie, your workspace email, your CRM, your helpdesk. Set up DKIM for any that fail.
3. Move to `p=quarantine`, optionally with `pct=25` at first.
4. Finish at `p=reject`.

Mail sent through Delivrie from a verified domain passes DMARC: it's DKIM-signed with your domain, and the return path on your domain passes SPF.

## Gmail and Yahoo requirements

If you send more than 5,000 emails a day to Gmail or Yahoo addresses, they require:

- SPF and DKIM (Delivrie sets both up when you verify the domain)
- a DMARC record, at least `p=none`
- one-click unsubscribe on marketing email (Delivrie adds it to [broadcasts](/docs/broadcasts) automatically)
- a spam complaint rate under 0.3%; aim for under 0.1%

See the [Deliverability guide](/docs/deliverability) for the rest.
