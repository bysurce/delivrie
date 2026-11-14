# Add suppression

`POST https://delivrie.io/api/suppressions`

Stop sending to one or more addresses.

Access: Needs a full access key.. MCP tool: `add_suppression`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string \| string[] | Yes | Address or addresses. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/suppressions' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "old@example.com"
  }'
```

## Response

```json
{
  "object": "suppression",
  "added": 1
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
