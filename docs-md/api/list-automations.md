# List automations

`GET https://delivrie.io/api/automations`

Automations with their trigger, status (draft, live or paused) and step count.

Access: Needs a full access key.. MCP tool: `list_automations`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/automations' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "automation",
      "id": "au_3…",
      "name": "Welcome series",
      "status": "live",
      "trigger": {
        "type": "event",
        "event": "user.created"
      },
      "steps": 3
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
