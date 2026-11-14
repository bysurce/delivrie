# List suppressions

`GET https://delivrie.io/api/suppressions`

Up to 1,000 suppressed addresses with the reason.

Access: Needs a full access key.. MCP tool: `list_suppressions`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/suppressions' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "email": "old@example.com",
      "reason": "bounce"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
