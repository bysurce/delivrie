# Publish automation

`POST https://delivrie.io/api/automations/:id/publish`

Make the current version live. Pause with /pause and continue with /resume.

Access: Needs a full access key.. MCP tool: `publish_automation`.

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
curl -X POST 'https://delivrie.io/api/automations/4ef9a417/publish' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "automation",
  "id": "au_3…",
  "status": "live"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
