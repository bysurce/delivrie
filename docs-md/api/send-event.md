# Send event

`POST https://delivrie.io/api/events`

Record a custom event for a contact. Live automations listening for the event start a run right away. The contact is created if it doesn’t exist.

Access: Any API key.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `event` | string | Yes | Lowercase name with dots for namespaces, like user.created. |
| `email` | string | Yes | The contact the event is about. |
| `data` | object | No | Any JSON up to 32 KB. Use it in automation filters, conditions and templates as {{{data.field}}}. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/events' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "user.created",
    "email": "ada@example.com",
    "data": {
      "country": "NG",
      "plan": "free"
    }
  }'
```

## Response

```json
{
  "object": "event",
  "id": "8d1c…",
  "event": "user.created",
  "runs": 1
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 422 | `validation_error` | The event name or email is invalid, or data is over 32 KB. |
