# Deliverability guide

How to keep Delivrie email out of spam: authentication, warming up a new domain, bounce and complaint thresholds, content, list hygiene and what to do when mail goes to spam.

Deliverability is whether your email reaches the inbox rather than the spam folder. Mailbox providers decide based on your domain's authentication, your sending history and how recipients react.

## The basics

1. **Authenticate.** Verify your domain so mail is DKIM-signed and passes SPF, and add [DMARC](/docs/dmarc).
2. **Send from a subdomain** like `mail.acme.com`, so app email and team email don't share a reputation.
3. **Only email people who asked for it.** Never buy or scrape lists.
4. **Make unsubscribing easy.** Broadcasts get a one-click unsubscribe header automatically; include a visible link too.
5. **Send what people expect,** when they expect it. Password resets and receipts rarely go to spam; surprise newsletters do.

## Stay under these limits

| Metric | Keep it under | What happens above it |
| --- | --- | --- |
| Bounce rate | 4% | Providers start blocking you, and Delivrie pauses your sending |
| Complaint rate | 0.08% (and never above 0.3%) | Gmail and Yahoo filter or reject your mail, and Delivrie pauses your sending |

### Automatic pause

Delivrie checks every account once an hour. If, over the last 7 days, more than 4% of your emails bounced (once you've sent at least 100) or more than 0.08% were marked as spam (once you've sent at least 1,000), sending is paused for the whole account. Sends then fail with `403 sending_paused`, and your team admins get an email explaining why. Emails to the [test addresses](/docs/test-mode) don't count.

To resume, find the cause (usually an old or imported list, or a sign-up form without validation), remove the bad addresses, and email support@delivrie.io with what you changed. This protects your domain's reputation as well as everyone else's.

Watch both in [Metrics](https://delivrie.io/metrics) or with `GET /metrics`.

## Warm up a new domain

A new domain has no reputation. Start with your most-engaged recipients and grow over a few weeks:

| Week | Emails a day |
| --- | --- |
| 1 | Up to a few hundred |
| 2 | 1,000 to 2,000 |
| 3 | 5,000 |
| 4 onward | Double while bounces and complaints stay low |

Transactional email (sign-ins, receipts) warms a domain naturally, because people open it.

## Keep your list clean

- Confirm addresses at sign-up (double opt-in for newsletters).
- Delivrie adds hard bounces and complaints to your [suppression list](/docs/suppressions) automatically. Don't remove addresses from it unless you're sure they're valid.
- Remove contacts who haven't opened anything in six months, or ask them to re-confirm.
- Use [test addresses](/docs/test-mode) for testing, never made-up addresses at real domains.

## Content

- Send a plain-text part (Delivrie generates one from your HTML).
- Keep a sensible balance of text and images; never send a single image as the whole email.
- Use your real domain in links. Link shorteners and mismatched domains look like phishing.
- Avoid misleading subject lines, all caps and lots of exclamation marks.
- Keep the HTML under about 100 KB; Gmail clips larger messages.

## If mail goes to spam

1. Check the email's events in [Emails](https://delivrie.io/emails). `delivered` means the provider accepted it; where it filed it is the provider's choice.
2. Check that SPF, DKIM and DMARC pass: in Gmail, open the message, choose **Show original** and look for `PASS` on all three.
3. Look at recent bounce and complaint rates in [Metrics](https://delivrie.io/metrics).
4. Register your domain with [Google Postmaster Tools](https://postmaster.google.com) to see your reputation at Gmail.
5. If you changed something recently (a new domain, a bigger list, new content), go back to sending only to engaged recipients for a week or two.
