---
title: Why isn't my domain verifying?
group: Platform
order: 2
description: Fix a Delivrie domain stuck on pending or failed: doubled record names, split DKIM values, duplicate SPF records, Cloudflare proxying, propagation, and how to check DNS yourself.
---
Work through these in order. Most stuck domains have one of the first three problems.

## 1. The record name is doubled

Many DNS providers add your domain to the end of the name. If you type the full name, you get `<selector>._domainkey.mail.acme.com.acme.com`.

Fix: type only the part before your root domain, like `<selector>._domainkey.mail`. See [Entering records at your DNS provider](/docs/domains).

## 2. The DKIM value was changed

The DKIM `TXT` value is long. Some providers split it or add quotes or spaces.

Fix: paste the whole value, starting with `p=`, as a single string. If your provider needs long values split, split it into quoted chunks with no spaces inside the key.

## 3. Two SPF records on the same name

A name can only have one SPF (`v=spf1`) record. If `send.mail.acme.com` already has one, from Resend or another provider, the check fails.

Fix: delete the old record, or set a different return path in the domain's settings (for example `bounces`) and add the new SPF records there.

## 4. Cloudflare is proxying

Records set to **Proxied** (orange cloud) don't resolve as written.

Fix: switch each Delivrie record to **DNS only** (grey cloud).

## 5. DNS hasn't updated yet

Changes usually show up within minutes, but some providers take hours, and up to 72 hours in rare cases.

Fix: wait, then click **Verify DNS records**. Delivrie also keeps checking pending domains in the background, and sends a `domain.updated` webhook when the status changes.

## Check DNS yourself

Look the records up from your computer:

```bash
dig +short TXT <selector>._domainkey.mail.acme.com
dig +short MX send.mail.acme.com
dig +short TXT send.mail.acme.com
```

Or use a web tool such as [Google's dig](https://toolbox.googleapps.com/apps/dig/). If the answer is empty, the record isn't live yet or the name is wrong. If it shows a different value, fix the value.

Still stuck after checking all of these? Use the chat button in the dashboard, and include the domain name. We'll look at your DNS with you.
