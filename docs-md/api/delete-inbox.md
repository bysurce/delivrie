# Delete inbox

`DELETE https://delivrie.io/api/inboxes/:id`

Remove an inbox and its agent settings. Mail to the address keeps arriving, and its conversations move to Other mail.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The inbox's id or address. |

## Example request

```bash
curl -X DELETE 'https://delivrie.io/api/inboxes/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "inbox",
  "id": "be19…",
  "deleted": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
