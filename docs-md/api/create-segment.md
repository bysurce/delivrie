# Create segment

`POST https://delivrie.io/api/segments`

Create a segment to group contacts for broadcasts and automations.

Access: Needs a full access key.. MCP tool: `create_segment`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Segment name. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/segments' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Beta users"
  }'
```

## Response

```json
{
  "object": "segment",
  "id": "s_4…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
