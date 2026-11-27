# List recipients

`GET https://delivrie.io/api/broadcasts/:id/recipients`

Who a broadcast went to, with each email's status and whether it was delivered, opened, clicked, bounced or unsubscribed. Before sending, the contacts it will reach. `recipients` is the count after unsubscribes, topic opt-outs and suppressions.

Access: Needs a full access key.. MCP tool: `list_broadcast_recipients`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The broadcast id. |
| `limit` | number | No | Results per page, 1 to 100. Default: `50`. |
| `offset` | number | No | How many results to skip. Default: `0`. |
| `status` | string | No | Only emails with this status, e.g. bounced or delivered. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/broadcasts/4ef9a417/recipients' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "recipients": 1180,
  "has_more": true,
  "data": [
    {
      "object": "broadcast_recipient",
      "email_id": "4ef9…",
      "email": "ada@example.com",
      "status": "delivered",
      "delivered": true,
      "opened": true,
      "clicked": false,
      "bounced": false,
      "unsubscribed": false
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
