---
title: Suppression list
group: Platform
order: 5
description: How Delivrie's suppression list protects your reputation: which addresses are added automatically, and how to add, list and remove addresses with the dashboard or API.
---
Your team's suppression list holds addresses Delivrie won't send to. Sends to a suppressed address are skipped automatically, so one bad address can't keep hurting your reputation.

## What gets added automatically

| Event | Added? |
| --- | --- |
| Hard (permanent) bounce: the address doesn't exist | Yes, reason `bounce` |
| Spam complaint | Yes, reason `complaint`. The contact is also unsubscribed from broadcasts |
| Soft (transient) bounce: mailbox full, server busy | No |
| Bounces and complaints from [test addresses](/docs/test-mode) | No |

## What happens when you send to one

Suppressed addresses are removed from `to`, `cc` and `bcc` when the email is sent, and the rest of the recipients get it as normal. If every recipient is suppressed, the email's status becomes `suppressed` and nothing is sent. The API still returns `200` with an id, so check the status or watch your webhooks if this matters to you.

## Manage the list

In the dashboard, open [Suppressions](https://delivrie.io/suppressions). With the API:

```bash
# Add one or several
curl -X POST https://delivrie.io/api/suppressions \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "email": ["old@example.com", "left@example.com"] }'

# List (up to 1,000, with the reason)
curl https://delivrie.io/api/suppressions -H "Authorization: Bearer $DELIVRIE_API_KEY"

# Remove
curl -X DELETE https://delivrie.io/api/suppressions/old@example.com -H "Authorization: Bearer $DELIVRIE_API_KEY"
```

> **Warning:** Only remove an address if you know it now works, for example the person fixed a typo or asked to receive email again. Sending to addresses that bounced or complained again damages your reputation quickly.

## Importing from another provider

Moving from another provider? Import its bounce and complaint lists with `POST /suppressions` before your first send, so you don't repeat their mistakes.
