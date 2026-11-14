# List threads

`GET https://delivrie.io/api/inbox/threads`

Conversations from received email, newest first.

Access: Needs a full access key.. MCP tool: `list_inbox_threads`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | No | open, archived or all. Default: `open`. |
| `needs_reply` | boolean | No | Only threads whose latest message is from the contact. |
| `unread` | boolean | No | Only unread threads. |
| `mailbox` | string | No | Only one receiving address. |
| `label` | string | No | Only threads with this label. |
| `q` | string | No | Search subject, contact and snippet. |
| `limit` | number | No | Results, 1 to 100. Default: `50`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/inbox/threads' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "inbox_thread",
      "id": "th_4…",
      "mailbox": "support@in.acme.com",
      "contact": "ada@example.com",
      "subject": "Refund",
      "snippet": "Hi, I'd like…",
      "unread": true,
      "needs_reply": true,
      "labels": []
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
