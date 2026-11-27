# Send draft

`POST https://delivrie.io/api/inbox/drafts/:id/send`

Send a draft. Replies keep their Message-ID threading. Also available: PATCH /inbox/drafts/:id to edit and DELETE /inbox/drafts/:id to discard.

Access: Needs a full access key.. MCP tool: `send_draft`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The draft id. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/inbox/drafts/4ef9a417/send' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "email",
  "id": "7d1f…",
  "draft_id": "dr2…",
  "thread_id": "th_4…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
