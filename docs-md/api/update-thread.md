# Update thread

`PATCH https://delivrie.io/api/inbox/threads/:id`

Archive or reopen, mark read or unread, or set labels.

Access: Sending or full access. MCP tool: `update_thread`.

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
| `status` | string | No | open or archived. |
| `unread` | boolean | No | Read state. |
| `labels` | string[] | No | Label names. New labels are created. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/inbox/threads/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "archived",
    "labels": [
      "refunds"
    ]
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
