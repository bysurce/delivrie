# Delete segment

`DELETE https://delivrie.io/api/segments/:id`

Delete a segment. Its contacts are kept.

Access: Needs a full access key.. MCP tool: `delete_segment`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The segment id. |

## Example request

```bash
curl -X DELETE 'https://delivrie.io/api/segments/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "segment",
  "id": "s_4…",
  "deleted": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
