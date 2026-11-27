# Add note

`POST https://delivrie.io/api/inbox/threads/:id/notes`

Leave an internal note on a conversation for the team. Notes are never emailed.

Access: Needs a full access key.. MCP tool: `add_thread_note`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The thread id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `body` | string | Yes | The note, up to 5,000 characters. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/inbox/threads/4ef9a417/notes' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "body": "Checked Stripe: safe to refund one charge."
  }'
```

## Response

```json
{
  "object": "inbox_note",
  "id": "n1…",
  "body": "Checked Stripe: safe to refund one charge."
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
