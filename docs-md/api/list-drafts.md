# List drafts

`GET https://delivrie.io/api/inbox/drafts`

Open drafts in the Inbox, including the ones the inbox agent wrote.

Access: Needs a full access key.. MCP tool: `list_drafts`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `thread_id` | string | No | Only drafts in this thread. |
| `inbox` | string | No | An inbox's id or address. |
| `source` | string | No | user or agent. |
| `limit` | number | No | Results, 1 to 100. Default: `20`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/inbox/drafts' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "inbox_draft",
      "id": "dr1…",
      "thread_id": "th_4…",
      "source": "agent",
      "to": [
        "ada@example.com"
      ],
      "subject": "Re: Refund",
      "text": "Hi Ada, …",
      "note": "Confirm the charge before sending.",
      "status": "draft"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
