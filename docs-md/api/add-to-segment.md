# Add to segment

`POST https://delivrie.io/api/segments/:id/contacts`

Add contacts to a segment, creating any that don't exist.

Access: Needs a full access key..

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
| `contacts` | string[] \| object[] | Yes | Emails or contact objects. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/segments/4ef9a417/contacts' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "contacts": [
      "ada@example.com",
      "sam@example.com"
    ]
  }'
```

## Response

```json
{
  "object": "segment",
  "id": "s_4…",
  "added": 2
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
