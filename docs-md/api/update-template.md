# Update template

`PATCH https://delivrie.io/api/templates/:id`

Change a template's name, alias, from, reply_to, subject, variables, html or content. Changes are saved as a draft: emails keep using the published version until you publish again. :id can be the alias.

Access: Needs a full access key.. MCP tool: `update_template`.

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
| `name` | string | No | Template name. |
| `subject` | string | No | Subject, with {{variables}}. |
| `html` | string | No | Replaces the content with this HTML. |
| `variables` | object[] | No | { name, type, fallback } definitions. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/templates/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "subject": "Welcome to Acme, {{first_name}}"
  }'
```

## Response

```json
{
  "object": "template",
  "id": "t_2…",
  "status": "published",
  "note": "Saved. Publish the template to use these changes when sending."
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
