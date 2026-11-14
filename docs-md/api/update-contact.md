# Update contact

`PATCH https://delivrie.io/api/contacts/:id`

Update names, properties or the unsubscribed flag.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Contact id or email address. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `first_name` | string | No | First name. |
| `last_name` | string | No | Last name. |
| `unsubscribed` | boolean | No | Stop broadcasts to this contact. |
| `properties` | object | No | Merged into existing properties. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/contacts/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "unsubscribed": true
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
