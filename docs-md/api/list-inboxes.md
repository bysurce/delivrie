# List inboxes

`GET https://delivrie.io/api/inboxes`

Inboxes on your receiving domains, with open, unread and needs-reply counts and each inbox's agent settings.

Access: Needs a full access key.. MCP tool: `list_inboxes`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/inboxes' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "inbox",
      "id": "be19…",
      "name": "Support",
      "address": "support@in.acme.com",
      "agent": {
        "enabled": true,
        "tone": "friendly",
        "actions": [
          "draft_reply",
          "add_labels",
          "mark_spam"
        ],
        "forward_to": []
      },
      "counts": {
        "open": 12,
        "unread": 3,
        "needs_reply": 5
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
