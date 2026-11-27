# Retrieve import

`GET https://delivrie.io/api/contacts/imports/:id`

An import's progress and result: created, updated and skipped counts, with the first 100 errors.

Access: Needs a full access key.. MCP tool: `get_contact_import`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The import id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/contacts/imports/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "contact_import",
  "id": "i_4…",
  "status": "completed",
  "total": 1200,
  "processed": 1200,
  "created": 1150,
  "updated": 45,
  "skipped": 5,
  "errors": [
    {
      "row": 18,
      "email": "ada@",
      "message": "Invalid email address"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
