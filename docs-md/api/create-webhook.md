# Create webhook

`POST https://delivrie.io/api/webhooks`

Send events to an HTTPS endpoint. Each payload is signed; failed deliveries are retried with backoff.

Access: Needs a full access key.. MCP tool: `create_webhook`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `endpoint` | string | Yes | An https:// URL. |
| `events` | string[] | Yes | Events to send, for example email.delivered and email.bounced. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/webhooks' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "endpoint": "https://acme.com/hooks/delivrie",
    "events": [
      "email.delivered",
      "email.bounced",
      "email.complained"
    ]
  }'
```

## Response

```json
{
  "object": "webhook",
  "id": "w_8c…",
  "signing_secret": "whsec_••••"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 403 | `plan_limit_reached` | Your plan's webhook limit is reached. |
