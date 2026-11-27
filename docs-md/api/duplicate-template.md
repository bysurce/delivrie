# Duplicate template

`POST https://delivrie.io/api/templates/:id/duplicate`

Copy a template as a new draft.

Access: Needs a full access key.. MCP tool: `duplicate_template`.

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
| `name` | string | No | Name for the copy. |
| `alias` | string | No | Alias for the copy. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/templates/4ef9a417/duplicate' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "template",
  "id": "t_3…",
  "name": "Copy of Welcome"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
