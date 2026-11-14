# Forward email

`POST https://delivrie.io/api/emails/:id/forward`

Forward a sent or received email to other addresses, with an optional note above it.

Access: Sending or full access. MCP tool: `forward_email`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The email id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `to` | string \| string[] | Yes | Where to forward it. |
| `from` | string | Yes | Sender on a verified domain. |
| `note` | string | No | A message shown above the forwarded email. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/emails/4ef9a417/forward' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "ops@acme.com",
    "from": "Acme <support@mail.acme.com>",
    "note": "Can you look at this?"
  }'
```

## Response

```json
{
  "id": "9b2e…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
