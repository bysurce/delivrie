# List events

`GET https://delivrie.io/api/events`

Without name: every event name your team has sent, with when it was first and last seen. With name: the most recent events with that name.

Access: Needs a full access key.. MCP tool: `list_events`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | No | An event name, like user.created. |
| `limit` | number | No | Results, 1 to 100. Default: `50`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/events' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "name": "user.created",
      "first_seen_at": "2026-11-01T09:00:00Z",
      "last_seen_at": "2026-11-14T10:00:00Z"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
