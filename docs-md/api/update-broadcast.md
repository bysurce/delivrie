# Update broadcast

`PATCH https://delivrie.io/api/broadcasts/:id`

Edit a draft broadcast: any of the fields from Create broadcast.

Access: Needs a full access key.. MCP tool: `update_broadcast`.

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
| `name` | string | No | Internal name. |
| `from` | string | No | Sender on a verified domain. |
| `subject` | string | No | Subject line. |
| `preview_text` | string | No | Inbox preview text. |
| `segment_id` | string | No | Who it goes to. |
| `topic_id` | string | No | The topic contacts can opt out of. |
| `html` | string | No | Replaces the content with this HTML. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/broadcasts/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "subject": "Our biggest update yet",
    "segment_id": "s_1…"
  }'
```

## Response

```json
{
  "object": "broadcast",
  "id": "b_7…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
