# List runs

`GET https://delivrie.io/api/automations/:id/runs`

Runs, newest first, with their status, current step and log.

Access: Needs a full access key.. MCP tool: `list_automation_runs`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The automation id. |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | No | running, completed, failed or canceled. |
| `limit` | number | No | Results, 1 to 100. Default: `50`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/automations/4ef9a417/runs' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "run_9…",
      "email": "ada@example.com",
      "status": "completed",
      "started_at": "2026-11-14T09:00:00Z"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
