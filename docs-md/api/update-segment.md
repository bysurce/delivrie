# Update segment

`PATCH https://delivrie.io/api/segments/:id`

Rename a segment. GET /segments/:id returns one with its contact count.

Access: Needs a full access key.. MCP tool: `update_segment`.

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
| `name` | string | Yes | The new name. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/segments/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "segment",
  "id": "s_1…",
  "name": "Customers (EU)"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
