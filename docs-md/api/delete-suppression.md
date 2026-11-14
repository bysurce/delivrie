# Remove suppression

`DELETE https://delivrie.io/api/suppressions/:email`

Allow sending to an address again.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | The suppressed address. |

## Example request

```bash
curl -X DELETE 'https://delivrie.io/api/suppressions/old@example.com' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "deleted": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
