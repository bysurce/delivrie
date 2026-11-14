# Send broadcast

`POST https://delivrie.io/api/broadcasts/:id/send`

Send now, or schedule with scheduled_at.

Access: Needs a full access key.. MCP tool: `send_broadcast`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The broadcast id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `scheduled_at` | string | No | ISO 8601 date to schedule. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/broadcasts/4ef9a417/send' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "scheduled_at": "2026-11-20T08:00:00Z"
  }'
```

## Response

```json
{
  "object": "broadcast",
  "id": "b_7…",
  "status": "scheduled",
  "recipients": 3240
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
