# Retrieve automation

`GET https://delivrie.io/api/automations/:id`

One automation with its steps and run counts.

Access: Needs a full access key.. MCP tool: `get_automation`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The automation id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/automations/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "automation",
  "id": "au_3…",
  "name": "Welcome series",
  "status": "live",
  "runs": {
    "running": 12,
    "completed": 340,
    "failed": 1,
    "canceled": 0
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
