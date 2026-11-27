# Edit email content

`POST https://delivrie.io/api/templates/:id/content`

Edit a template (or, at /broadcasts/:id/content, a draft broadcast) block by block. Anyone with it open in the editor sees the change within seconds and can undo it. Template changes stay a draft until published.

Access: Needs a full access key.. MCP tool: `edit_email_content`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The template id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `ops` | object[] | No | Operations, in order: replace, update, insert, delete, move. See the AI writing guide. |
| `blocks` | object[] | No | Replace every block. |
| `subject` | string | No | New subject. |
| `preview_text` | string | No | New preview text (broadcasts). |
| `summary` | string | No | One line on what changed, shown in the editor. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/templates/4ef9a417/content' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "ops": [
      {
        "op": "update",
        "id": "b2",
        "set": {
          "html": "Thanks for joining, {{first_name}}."
        }
      },
      {
        "op": "insert",
        "after": "b2",
        "block": {
          "type": "button",
          "text": "Open the dashboard",
          "href": "https://acme.com/app"
        }
      }
    ],
    "summary": "Added a button"
  }'
```

## Response

```json
{
  "object": "template_content",
  "id": "t_2…",
  "agent_edit": {
    "by": "Claude",
    "at": "2026-11-28T10:00:00Z",
    "rev": 3,
    "summary": "Added a button"
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
