# Create draft

`POST https://delivrie.io/api/inbox/drafts`

Save a draft for the team: a reply in a thread (thread_id), or a new email from an inbox. Nothing is sent.

Access: Needs a full access key.. MCP tool: `create_draft`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `thread_id` | string | No | Reply in this thread. Recipient, subject and sender default from the thread. |
| `inbox` | string | No | Or start a new email from this inbox (id or address). |
| `to` | string[] | No | Recipients. |
| `cc` | string[] | No | Cc. |
| `bcc` | string[] | No | Bcc. |
| `subject` | string | No | Subject. |
| `text` | string | No | Body as plain text. |
| `html` | string | No | Body as HTML. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/inbox/drafts' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "thread_id": "th_4…",
    "text": "Hi Ada, your refund is on its way."
  }'
```

## Response

```json
{
  "object": "inbox_draft",
  "id": "dr2…",
  "thread_id": "th_4…",
  "status": "draft"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
