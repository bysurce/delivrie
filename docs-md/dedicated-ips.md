# Dedicated IPs

Send from IP addresses only your team uses, warmed up and scaled automatically. Available on Scale and Enterprise.

By default, Delivrie sends your mail from a shared pool of IP addresses with a strong reputation. With dedicated IPs, your mail goes out from addresses only your team uses, so your sending reputation depends only on what you send.

Dedicated IPs are available on the **Scale** and **Enterprise** plans. They suit senders with steady volume, usually **3,000 emails a day or more**. Below that, shared IPs give you a better reputation, and Amazon may move low-volume mail back to them anyway.

## How it works

Delivrie uses Amazon SES managed dedicated IPs. When yours are switched on:

- Each region your domains send from gets its own pool of IPs for your team, and your domains are moved onto it. Your API calls, SMTP settings and DNS records don't change.
- The IPs are **warmed up automatically**, separately for each mailbox provider (Gmail, Outlook, Yahoo and so on). During warm-up, which takes a few weeks, some of your mail still goes out through the shared pool so delivery stays steady.
- More IPs are added as your volume grows, and removed if it drops for a long time.
- If you add a domain in a new region later, it gets a pool there too.

Your reputation is now yours alone, so keep bounce and complaint rates low: send only to people who asked for your mail, and remove addresses that bounce. The [deliverability guide](/docs/deliverability) covers the details.

## Get dedicated IPs

1. Go to **Settings → Dedicated IPs** (team admins only).
2. Choose **Request dedicated IPs** and tell us your expected volume.
3. We review requests within one business day. Your team's admins get an email when the IPs are on.

To turn them off, choose **Turn off dedicated IPs** on the same page. Your domains go back to the shared IPs straight away and the dedicated IPs are released. If you want them again later, they need warming up again.

## Check the status from the API

`GET /dedicated-ips` returns the status (`off`, `requested`, `active`, `declined` and so on), the regions with a pool, your plan and your average daily volume over the last 14 days. Requesting and turning them off happen in the dashboard.

```bash
curl https://delivrie.io/api/dedicated-ips -H "Authorization: Bearer $DELIVRIE_API_KEY"
```
