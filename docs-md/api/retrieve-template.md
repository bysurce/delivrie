# Retrieve template

`GET https://delivrie.io/api/templates/:id`

One template by id or alias, with its current draft and published version.

Access: Needs a full access key.. MCP tool: `get_template`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Template id or alias. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/templates/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "template",
  "id": "t_2…",
  "name": "Order confirmation",
  "alias": "order-confirmation",
  "status": "published",
  "published_version": 3
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
