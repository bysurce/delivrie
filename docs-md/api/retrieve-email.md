# Retrieve email

`GET https://delivrie.io/api/emails/:id`

Get one email with its status and every delivery event.

Access: Needs a full access key.. MCP tool: `get_email`.

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
curl -X GET 'https://delivrie.io/api/emails/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "email",
  "id": "4ef9a417-…",
  "from": "Acme <orders@acme.com>",
  "to": [
    "ada@example.com"
  ],
  "subject": "Your order is confirmed",
  "last_event": "delivered",
  "created_at": "2026-11-12T09:12:04Z",
  "events": [
    {
      "type": "sent"
    },
    {
      "type": "delivered"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
