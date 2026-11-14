# Create template

`POST https://delivrie.io/api/templates`

Create a template. Publish it before sending it from the API.

Access: Needs a full access key.. MCP tool: `create_template`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Template name. |
| `alias` | string | No | Stable name to send by, like order-confirmation. |
| `subject` | string | No | Subject with {{{variables}}}. |
| `html` | string | No | HTML body. |
| `from` | string | No | Default sender. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/templates' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Order confirmation",
    "alias": "order-confirmation",
    "subject": "Order {{{order_id}}} confirmed",
    "html": "<p>Hi {{{first_name}}}</p>"
  }'
```

## Response

```json
{
  "object": "template",
  "id": "t_2…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
