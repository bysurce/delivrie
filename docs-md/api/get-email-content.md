# Get email content

`GET https://delivrie.io/api/templates/:id/content`

A template's (or, at /broadcasts/:id/content, a draft broadcast's) subject and blocks with their ids, and the block types you can write.

Access: Needs a full access key.. MCP tool: `get_email_content`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The template id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/templates/4ef9a417/content' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "template_content",
  "id": "t_2…",
  "subject": "Welcome to Acme",
  "content": {
    "blocks": [
      {
        "id": "b1",
        "type": "title",
        "html": "Welcome"
      }
    ]
  },
  "agent_edit": null
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
