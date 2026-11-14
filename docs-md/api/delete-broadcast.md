# Delete broadcast

`DELETE https://delivrie.io/api/broadcasts/:id`

Delete a draft, scheduled or sent broadcast. A broadcast that's sending can't be deleted.

Access: Needs a full access key..

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
curl -X DELETE 'https://delivrie.io/api/broadcasts/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "broadcast",
  "id": "b_7…",
  "deleted": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
