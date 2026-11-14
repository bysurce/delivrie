# Verify domain

`POST https://delivrie.io/api/domains/:id/verify`

Check the DNS records again. Verification usually completes within minutes of the records going live.

Access: Needs a full access key.. MCP tool: `verify_domain`.

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
curl -X POST 'https://delivrie.io/api/domains/4ef9a417/verify' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "domain",
  "id": "d91e…",
  "status": "verified"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
