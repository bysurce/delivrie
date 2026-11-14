# Create automation

`POST https://delivrie.io/api/automations`

Create a straight-line automation: a trigger and up to 30 send and wait steps. Build branches and conditions in the dashboard.

Access: Needs a full access key.. MCP tool: `create_automation`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Name. |
| `trigger` | object | Yes | { "event": "user.created" } or { "segment_id": "…" }. |
| `steps` | object[] | Yes | { "type": "send", "template_id": "alias" } or { "type": "wait", "amount": 2, "unit": "days" }. Units: minutes, hours, days, weeks. |
| `reentry` | string | No | once or always. Default: `once`. |
| `publish` | boolean | No | Publish right away. Default: `false`. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/automations' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Welcome series",
    "trigger": {
      "event": "user.created"
    },
    "steps": [
      {
        "type": "send",
        "template_id": "welcome"
      },
      {
        "type": "wait",
        "amount": 2,
        "unit": "days"
      },
      {
        "type": "send",
        "template_id": "tips"
      }
    ],
    "publish": true
  }'
```

## Response

```json
{
  "object": "automation",
  "id": "au_3…",
  "status": "live",
  "url": "https://delivrie.io/automations/au_3…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
