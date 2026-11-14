# Reply to thread

`POST https://delivrie.io/api/inbox/threads/:id/reply`

Reply in the thread. Threading headers and the Re: subject are set for you.

Access: Sending or full access. MCP tool: `reply_to_thread`.

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
| `text` | string | No | Plain-text reply, wrapped in simple HTML for you. Provide text or html. |
| `html` | string | No | HTML reply. |
| `from` | string | No | Sender. Defaults to the thread's mailbox address. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/inbox/threads/4ef9a417/reply' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Thanks Ada, your refund is on its way."
  }'
```

## Response

```json
{
  "object": "email",
  "id": "7d1f…",
  "thread_id": "th_4…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
