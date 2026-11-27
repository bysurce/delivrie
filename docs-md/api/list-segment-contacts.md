# List segment contacts

`GET https://delivrie.io/api/segments/:id/contacts`

The contacts in a segment.

Access: Needs a full access key.. MCP tool: `list_segment_contacts`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The segment id. |
| `limit` | number | No | Results per page, 1 to 100. Default: `50`. |
| `offset` | number | No | How many results to skip. Default: `0`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/segments/4ef9a417/contacts' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "total": 1200,
  "has_more": true,
  "data": [
    {
      "object": "contact",
      "id": "c_1…",
      "email": "ada@example.com",
      "first_name": "Ada"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
