# Get usage

`GET https://delivrie.io/api/usage`

Your plan, emails sent this month and today, the allowance and daily limit, and pay-as-you-go credits.

Access: Any API key. MCP tool: `get_usage`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/usage' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "usage",
  "plan": "free",
  "emails_this_month": 1840,
  "monthly_allowance": 4000,
  "emails_today": 37,
  "daily_limit": 133,
  "credits_emails": 0,
  "overage_after_allowance": false
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
