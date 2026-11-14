# Retrieve log

`GET https://delivrie.io/api/logs/:id`

One request with its request and response bodies.

Access: Needs a full access key.. MCP tool: `get_log`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The log id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/logs/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "id": "l_1…",
  "method": "POST",
  "endpoint": "/emails",
  "status": 200,
  "request_body": {},
  "response_body": {}
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
