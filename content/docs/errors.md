---
title: Errors
group: Sending
order: 6
description: Every Delivrie API error, what causes it and how to fix it, with the JSON error format and which errors are safe to retry.
---
Errors use standard HTTP status codes and a JSON body:

```json
{
  "statusCode": 422,
  "name": "validation_error",
  "message": "The from domain mail.acme.com is not verified yet (status: pending)."
}
```

Branch on `name` in code and show `message` to people: it's written to say exactly what went wrong. Every request, including failed ones, appears in [Logs](https://delivrie.io/logs) with its request and response bodies.

## Error reference

| Status | `name` | Cause | Fix |
| --- | --- | --- | --- |
| 401 | `missing_api_key` | No `Authorization` header | Add `Authorization: Bearer dlv_...` |
| 401 | `invalid_api_key` | The key doesn't exist or was deleted | Check the key; create a new one in [API keys](https://delivrie.io/api-keys) |
| 403 | `restricted_api_key` | A sending-only key called another endpoint, or sent from a domain it isn't allowed to use | Use a full access key, or send from the key's domain |
| 403 | `plan_limit_reached` | You've reached your plan's domain or webhook limit | Remove one, or upgrade in [Billing](https://delivrie.io/billing) |
| 403 | `insufficient_scope` | An MCP or OAuth connection wasn't granted this scope | Reconnect and approve the scope |
| 404 | `not_found` | Nothing with that id in this team | Check the id, and that the key belongs to the right team |
| 409 | `domain_exists` | The domain is already in this team | Use the existing domain |
| 409 | `domain_in_use` | Another team owns the domain | Claim it from the Domains page if it's yours |
| 422 | `validation_error` | A field is missing or invalid, or the `from` domain isn't verified | Read `message`; it names the field |
| 429 | `daily_quota_exceeded` | Free plan: 200 emails today | Wait until midnight UTC, buy credits or upgrade |
| 429 | `monthly_quota_exceeded` | Free plan: 6,000 emails this month | Buy credits or upgrade |
| 429 | `spending_cap_reached` | This send would take overage past your spending cap | Raise or remove the cap in [Billing](https://delivrie.io/billing) |
| 500 | `application_error` | Something failed on our side | Retry with the same idempotency key |
| 503 | `sending_not_configured` | Sending is temporarily unavailable | Retry later; check [status](https://delivrie.io/status) |

## Common `validation_error` messages

| Message | What to do |
| --- | --- |
| Request body must be valid JSON | Send a JSON body with `Content-Type: application/json` |
| Missing from / to / subject field | Add the field |
| Provide html or text | Add a body, or send a `template` |
| The from domain X is not verified | Add and verify the domain in [Domains](https://delivrie.io/domains), or fix a typo in `from` |
| X can only send to members of your team | You're using `onboarding@delivrie.io`. Verify your own domain to email anyone |
| to can have at most 50 addresses | Split the send, or use [batch sending](/docs/send-email) |
| Attachments are limited to 40 MB per email | Send a link to the file instead |
| Attachment path isn't supported yet | Send base64 `content` |
| scheduled_at must be an ISO 8601 date or a phrase... | Use `2026-12-01T09:00:00Z` or a phrase like `in 1 hour` |
| Template X has no published version | Publish the template |
| Tag names and values can only contain... | Use letters, numbers, `_` and `-` only |

## Retrying

Retry `5xx` errors and network failures with the same `Idempotency-Key`. Don't retry `4xx` errors, including quota `429`s; they won't succeed until something changes. See [Idempotency and retries](/docs/idempotency).

## Errors in the SDK

The [Node.js SDK](/docs/sdks) returns errors instead of throwing: `const { data, error } = await delivrie.emails.send(...)`. `error` has the same `statusCode`, `name` and `message`. Problems that never reach the API have `statusCode: 0` and the name `network_error`, `timeout` or `aborted`.
