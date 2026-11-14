# Retrieve domain

`GET https://delivrie.io/api/domains/:id`

Get a domain with its DNS records and their status.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The domain id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/domains/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "domain",
  "id": "d91e…",
  "name": "mail.kora.ng",
  "status": "verified"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
