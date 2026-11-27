# Update thread

`PATCH https://delivrie.io/api/inbox/threads/:id`

Move a thread between folders, mark it read or unread, assign it, or set its labels.

Access: Needs a full access key.. MCP tool: `update_thread`.

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
| `status` | string | No | open, archived, spam or trash. |
| `unread` | boolean | No | Read state. |
| `assignee` | string \| null | No | A team member's email, me, or null to unassign. |
| `labels` | string[] | No | Label names. Replaces the thread's labels; new labels are created. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/inbox/threads/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "archived",
    "labels": [
      "refunds"
    ],
    "assignee": "sam@acme.com"
  }'
```

## Response

```json
{
  "object": "inbox_thread",
  "id": "th_4…",
  "status": "archived",
  "labels": [
    "refunds"
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
