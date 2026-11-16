# Create contact

`POST https://delivrie.io/api/contacts`

Create a contact, or update it if the email already exists. Only the fields you send change; properties are merged.

Access: Needs a full access key.. MCP tool: `create_contact`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | Contact email. |
| `first_name` | string | No | First name. |
| `last_name` | string | No | Last name. |
| `properties` | object | No | Custom properties. |
| `segments` | string[] | No | Segment ids to add the contact to. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/contacts' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "ada@example.com",
    "first_name": "Ada",
    "properties": {
      "plan": "pro"
    }
  }'
```

## Response

```json
{
  "object": "contact",
  "id": "c_12…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
