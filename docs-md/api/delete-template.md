# Delete template

`DELETE https://delivrie.io/api/templates/:id`

Delete a template and its versions. Automations that send it will fail at that step.

Access: Needs a full access key.. MCP tool: `delete_template`.

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
curl -X DELETE 'https://delivrie.io/api/templates/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "template",
  "id": "t_2…",
  "deleted": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
