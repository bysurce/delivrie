# Retrieve broadcast

`GET https://delivrie.io/api/broadcasts/:id`

One broadcast with its status and delivery stats.

Access: Needs a full access key.. MCP tool: `get_broadcast`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The broadcast id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/broadcasts/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "broadcast",
  "id": "b_7…",
  "name": "March at Acme",
  "status": "sent",
  "recipients": 3240
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
