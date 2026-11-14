# List contacts

`GET https://delivrie.io/api/contacts`

List contacts, newest first.

Access: Needs a full access key.. MCP tool: `list_contacts`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | No | Results per page, 1 to 100. Default: `50`. |
| `offset` | number | No | How many results to skip. Default: `0`. |
| `created_after` | string | No | ISO date, or today. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/contacts' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "c_12…",
      "email": "ada@example.com"
    }
  ],
  "has_more": false
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
