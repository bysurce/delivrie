# List received emails

`GET https://delivrie.io/api/emails/received`

Emails that arrived on your receiving domains, newest first. Fetch one with Retrieve email for its HTML and text.

Access: Needs a full access key.. MCP tool: `list_received_emails`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | No | Results, 1 to 100. Default: `50`. |
| `to` | string | No | Only mail sent to this address. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/emails/received' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "a5c3e1f0-…",
      "from": "Ada <ada@example.com>",
      "to": [
        "support@in.acme.com"
      ],
      "subject": "Re: Your order",
      "created_at": "2026-11-14T10:22:30Z",
      "attachments": [
        {
          "filename": "photo.jpg",
          "content_type": "image/jpeg",
          "size": 248213
        }
      ]
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
