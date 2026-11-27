# Rename API key

`PATCH https://delivrie.io/api/api-keys/:id`

Rename an API key. Its token, access and domain don't change.

Access: Needs a full access key.. MCP tool: `update_api_key`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The API key id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | The new name, up to 100 characters. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/api-keys/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Production (web)"
  }'
```

## Response

```json
{
  "object": "api_key",
  "id": "k_3…",
  "name": "Production (web)",
  "prefix": "dlv_8xQ2",
  "permission": "sending"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
