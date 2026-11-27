# Run inbox agent

`POST https://delivrie.io/api/inbox/threads/:id/agent`

Run the inbox's agent on this conversation now, with the inbox's agent settings. It works on the latest received email and drafts rather than sends.

Access: Needs a full access key.. MCP tool: `run_inbox_agent`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The thread id. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/inbox/threads/4ef9a417/agent' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "inbox_agent_run",
  "id": "r1…",
  "status": "done",
  "actions": [
    {
      "type": "draft_reply",
      "ok": true,
      "draft_id": "dr1…"
    },
    {
      "type": "add_labels",
      "ok": true,
      "labels": [
        "billing"
      ]
    }
  ],
  "summary": "Drafted a refund reply and labelled it billing."
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
