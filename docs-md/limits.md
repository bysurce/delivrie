# Plans and limits

Email allowances, daily limits, domains, webhooks, data retention and team seats on Free, Starter, Pro and Scale, plus what happens when you reach a limit.

| | Free | Starter | Pro | Scale |
| --- | --- | --- | --- | --- |
| Emails a month | 6,000 | 20,000 | 60,000 | 100,000 |
| Daily limit | 200 | None | None | None |
| Over the allowance | Sending pauses (or uses credits) | Keeps sending, billed per 1,000 | Keeps sending, billed per 1,000 | Keeps sending, billed per 1,000 |
| Domains | 1 | 10 | 10 | 1,000 |
| Webhook endpoints | 1 | 10 | 10 | Unlimited |
| Team members | 1 | 5 | 5 | Unlimited |
| Sent email content kept | 1 day | 3 days | 3 days | 7 days |
| Inbox mail kept (received email and Inbox replies) | 7 days | 14 days | 30 days | 30 days |
| API request logs kept | 30 days | 30 days | 30 days | 30 days |

Prices are on the [pricing page](https://delivrie.io/pricing). Enterprise plans with custom volumes, retention and support are available through [sales](https://delivrie.io/contact-sales).

## What counts as an email

Each email you send through the API or SMTP counts as one, whether it goes to one recipient or several in `to`, `cc` and `bcc`. A batch of 50 counts as 50. Sends to the [test addresses](/docs/test-mode) count too. Broadcasts are billed through the marketing plan instead.

Check where you are with `GET /usage` or in [Billing](https://delivrie.io/billing):

```json
{
  "object": "usage",
  "plan": "free",
  "emails_this_month": 1840,
  "monthly_allowance": 6000,
  "emails_today": 37,
  "daily_limit": 200,
  "credits_emails": 0,
  "overage_after_allowance": false
}
```

## When you reach a limit

**Free plan.** At 200 emails in a day or 6,000 in a month, sends fail with `429 daily_quota_exceeded` or `429 monthly_quota_exceeded`. If you've bought pay-as-you-go credits, Delivrie uses them instead and keeps sending. One credit is one email, and credits never expire. Daily limits reset at midnight UTC; monthly limits on the 1st (UTC).

**Paid plans.** Sending never stops at the allowance. Emails over it are billed per 1,000 at the end of the month. To put a ceiling on that, set a spending cap in [Billing](https://delivrie.io/billing); a send that would go past it fails with `429 spending_cap_reached`.

**Domains and webhooks.** Adding more than your plan allows fails with `403 plan_limit_reached`.

> **Tip:** Treat `429` quota errors as "stop and alert someone", not "retry in a loop". Retrying won't succeed until the limit resets or the plan changes.
