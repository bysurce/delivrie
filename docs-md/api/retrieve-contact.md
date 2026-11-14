# Retrieve contact

`GET https://delivrie.io/api/contacts/:id`

Get a contact by id or email.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Contact id or email address. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/contacts/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "contact",
  "id": "c_12…",
  "email": "ada@example.com",
  "unsubscribed": false
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
