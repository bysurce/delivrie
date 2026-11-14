# List contact properties

`GET https://delivrie.io/api/contact-properties`

Custom contact properties with their type and fallback.

Access: Needs a full access key.. MCP tool: `list_contact_properties`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/contact-properties' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "key": "plan",
      "type": "string",
      "fallback": "free"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
