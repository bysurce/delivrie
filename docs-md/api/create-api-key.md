# Create API key

`POST https://delivrie.io/api/api-keys`

Create a key. The token is returned once, so store it somewhere safe.

Access: Needs a full access key.. MCP tool: `create_api_key`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | A name to recognise the key. |
| `permission` | string | No | full_access or sending_access. Default: `full_access`. |
| `domain_id` | string | No | Limit a sending key to one domain. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/api-keys' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Production",
    "permission": "sending_access"
  }'
```

## Response

```json
{
  "id": "k_31…",
  "token": "dlv_••••••••"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
