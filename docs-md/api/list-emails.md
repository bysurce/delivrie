# List emails

`GET https://delivrie.io/api/emails`

List sent emails, newest first.

Access: Needs a full access key.. MCP tool: `list_emails`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | No | Results per page, 1 to 100. Default: `50`. |
| `offset` | number | No | How many results to skip. Default: `0`. |
| `direction` | string | No | outbound or inbound. Default: `outbound`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/emails' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "4ef9a417-…",
      "subject": "Your order is confirmed",
      "last_event": "delivered"
    }
  ],
  "has_more": false
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
