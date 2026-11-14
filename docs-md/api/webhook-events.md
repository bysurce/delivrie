# List deliveries

`GET https://delivrie.io/api/webhooks/:id/events`

The last 100 delivery attempts for an endpoint, with status codes.

Access: Needs a full access key.. MCP tool: `list_webhook_events`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The webhook id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/webhooks/4ef9a417/events' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "event_type": "email.delivered",
      "status_code": 200,
      "attempts": 1,
      "delivered": true
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
