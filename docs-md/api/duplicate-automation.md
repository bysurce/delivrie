# Duplicate automation

`POST https://delivrie.io/api/automations/:id/duplicate`

Copy an automation, with its trigger and steps, as a new draft. PATCH /automations/:id renames it (name, reentry) and DELETE /automations/:id deletes one.

Access: Needs a full access key.. MCP tool: `duplicate_automation`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The automation id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | No | Name for the copy. Default: `Copy of …`. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/automations/4ef9a417/duplicate' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "automation",
  "id": "a_9…",
  "name": "Copy of Welcome series",
  "status": "draft",
  "url": "https://delivrie.io/automations/a_9…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
