# List logs

`GET https://delivrie.io/api/logs`

Every API request, newest first.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | No | Results per page, 1 to 100. Default: `50`. |
| `offset` | number | No | How many results to skip. Default: `0`. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/logs' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "l_1…",
      "method": "POST",
      "endpoint": "/emails",
      "status": 200
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
