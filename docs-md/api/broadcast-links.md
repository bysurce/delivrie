# List clicked links

`GET https://delivrie.io/api/broadcasts/:id/links`

Every link people clicked in a broadcast, with total and unique clicks, most clicked first. Click tracking must be on for the domain.

Access: Needs a full access key.. MCP tool: `list_broadcast_links`.

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
curl -X GET 'https://delivrie.io/api/broadcasts/4ef9a417/links' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "total_clicks": 412,
  "data": [
    {
      "object": "broadcast_link",
      "link": "https://acme.com/pricing",
      "clicks": 301,
      "unique_clicks": 254
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
