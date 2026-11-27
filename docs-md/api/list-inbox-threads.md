# List threads

`GET https://delivrie.io/api/inbox/threads`

Conversations from received email, newest first. q takes Gmail-style search: words, "phrases", from: to: subject: label: is:unread|read|assigned|unassigned|needs-reply in:archive|spam|trash|anywhere has:attachment|draft before: after:.

Access: Needs a full access key.. MCP tool: `list_inbox_threads`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `inbox` | string | No | An inbox's id or address, or none for mail outside any inbox. |
| `status` | string | No | open, archived, spam, trash or all. Default: `open`. |
| `needs_reply` | boolean | No | Only threads whose latest message is from the contact. |
| `unread` | boolean | No | Only unread threads. |
| `assignee` | string | No | me, a team member's email, or none. |
| `label` | string | No | Only threads with this label. |
| `q` | string | No | Search, using the syntax above. |
| `limit` | number | No | Results, 1 to 100. Default: `20`. |

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
      "inbox_id": "be19…",
      "mailbox": "support@in.acme.com",
      "contact": "ada@example.com",
      "subject": "Refund",
      "snippet": "Hi, I'd like…",
      "unread": true,
      "status": "open",
      "needs_reply": true,
      "labels": [
        "billing"
      ],
      "assignee": {
        "email": "sam@acme.com",
        "name": "Sam"
      }
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
