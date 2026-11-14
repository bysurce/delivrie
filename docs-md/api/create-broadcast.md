# Create broadcast

`POST https://delivrie.io/api/broadcasts`

Create a broadcast draft. Nothing sends until you call Send broadcast.

Access: Needs a full access key.. MCP tool: `create_broadcast`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | string | Yes | Sender on a verified domain. |
| `subject` | string | Yes | Subject line. |
| `segment_id` | string | Yes | Who receives it. |
| `html` | string | No | HTML body. Include an unsubscribe link with {{{unsubscribe_url}}}. |
| `topic_id` | string | No | Topic people can opt out of. |
| `name` | string | No | Internal name. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/broadcasts' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "Acme <news@acme.com>",
    "subject": "March at Acme",
    "segment_id": "s_4…",
    "html": "<p>Hi {{{first_name|there}}}</p>"
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
