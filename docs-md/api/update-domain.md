# Update domain

`PATCH https://delivrie.io/api/domains/:id`

Change tracking, TLS, the return path or receiving settings.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The domain id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `click_tracking` | boolean | No | Track link clicks. |
| `open_tracking` | boolean | No | Track opens. |
| `tls` | string | No | opportunistic or enforced. |
| `return_path` | string | No | Bounce subdomain label. |
| `receiving_enabled` | boolean | No | Receive email on this domain. |
| `receiving_subdomain` | string | No | Receive on a subdomain, like in. Empty for the domain itself. |
| `receiving_mode` | string | No | all or specific. |
| `receiving_addresses` | string[] | No | Addresses that accept mail when receiving_mode is specific. |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/domains/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "open_tracking": true
  }'
```

## Response

```json
{
  "object": "domain",
  "id": "d91e…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
