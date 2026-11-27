# Update inbox

`PATCH https://delivrie.io/api/inboxes/:id`

Rename an inbox or set up its agent. The agent runs on new mail and acts only within the actions you allow. It drafts replies for people to send and never sends them itself, and it forwards only to the addresses in forward_to.

Access: Needs a full access key.. MCP tool: `update_inbox`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The inbox's id or address. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | No | Display name. |
| `description` | string | No | Description. |
| `agent.enabled` | boolean | No | Run the agent on new mail. |
| `agent.instructions` | string | No | Plain-language instructions, up to 4,000 characters. |
| `agent.tone` | string | No | friendly, professional, concise, or your own words. Default: `friendly`. |
| `agent.actions` | string[] | No | Any of draft_reply, add_labels, archive, mark_spam, assign, add_note, forward. |
| `agent.forward_to` | string[] | No | Up to 5 addresses the agent may forward to. Required for forward. |
| `agent.signature` | string | No | Added to the agent's drafts. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/inboxes/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "agent": {
      "enabled": true,
      "instructions": "We sell Acme Projects. Refunds within 30 days. Billing questions go to Sam.",
      "actions": [
        "draft_reply",
        "add_labels",
        "mark_spam",
        "assign"
      ]
    }
  }'
```

## Response

```json
{
  "object": "inbox",
  "id": "be19…",
  "name": "Support",
  "agent": {
    "enabled": true,
    "tone": "friendly",
    "actions": [
      "draft_reply",
      "add_labels",
      "mark_spam",
      "assign"
    ],
    "forward_to": [],
    "signature": ""
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
