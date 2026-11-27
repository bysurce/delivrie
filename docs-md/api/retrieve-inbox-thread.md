# Retrieve thread

`GET https://delivrie.io/api/inbox/threads/:id`

A thread with up to 100 messages as text, its internal notes, open drafts and the agent's recent runs.

Access: Needs a full access key.. MCP tool: `get_inbox_thread`.

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
curl -X GET 'https://delivrie.io/api/inbox/threads/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "inbox_thread",
  "id": "th_4…",
  "subject": "Refund",
  "messages": [
    {
      "id": "a5c3…",
      "direction": "inbound",
      "from": "ada@example.com",
      "text": "Hi, I'd like a refund…",
      "created_at": "2026-11-14T10:22:30Z"
    }
  ],
  "notes": [
    {
      "id": "n1…",
      "body": "Checked Stripe: safe to refund.",
      "author": {
        "name": "Sam"
      }
    }
  ],
  "drafts": [
    {
      "id": "dr1…",
      "source": "agent",
      "text": "Hi Ada, …",
      "note": "Confirm the charge before sending."
    }
  ],
  "agent_runs": [
    {
      "status": "done",
      "actions": [
        {
          "type": "draft_reply",
          "ok": true
        }
      ]
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
