# List API keys

`GET https://delivrie.io/api/api-keys`

List keys. Tokens are never shown again.

Access: Needs a full access key.. MCP tool: `list_api_keys`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/api-keys' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "k_31…",
      "name": "Production",
      "prefix": "dlv_a1b2",
      "permission": "sending"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
