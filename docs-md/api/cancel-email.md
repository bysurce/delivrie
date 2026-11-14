# Cancel email

`POST https://delivrie.io/api/emails/:id/cancel`

Cancel a scheduled email before it sends.

Access: Sending or full access. MCP tool: `cancel_email`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The email id. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/emails/4ef9a417/cancel' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "email",
  "id": "4ef9a417-…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
