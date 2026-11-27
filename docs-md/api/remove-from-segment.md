# Remove from segment

`DELETE https://delivrie.io/api/segments/:id/contacts`

Take contacts out of a segment. The contacts aren't deleted. DELETE /segments/:id/contacts/:email_or_id removes one.

Access: Needs a full access key.. MCP tool: `remove_contacts_from_segment`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The segment id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `contacts` | string[] | Yes | Emails or contact ids. |

## Example request

```bash
curl -X DELETE 'https://delivrie.io/api/segments/4ef9a417/contacts' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "contacts": [
      "ada@example.com"
    ]
  }'
```

## Response

```json
{
  "object": "segment",
  "id": "s_1…",
  "removed": 1
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
