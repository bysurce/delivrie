# Duplicate broadcast

`POST https://delivrie.io/api/broadcasts/:id/duplicate`

Copy a broadcast (any status) as a new draft with the same sender, segment, subject and content.

Access: Needs a full access key.. MCP tool: `duplicate_broadcast`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The broadcast id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | No | Name for the copy. Default: `Copy of …`. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/broadcasts/4ef9a417/duplicate' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "broadcast",
  "id": "b_8…",
  "name": "Copy of November update",
  "status": "draft"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
