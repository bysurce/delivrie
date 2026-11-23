# Set up DNS on Cloudflare

`POST https://delivrie.io/api/domains/:id/cloudflare`

Add the domain's DNS records to its Cloudflare zone using your Cloudflare API token (Zone: Read and DNS: Edit). The token is used for this request only and never stored. Existing records are never changed or deleted.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The domain id. |
| `api_token` | string | Yes | A Cloudflare API token with Zone: Read and DNS: Edit on this domain's zone. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/domains/4ef9a417/cloudflare' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "domain",
  "id": "d91e…",
  "status": "pending",
  "cloudflare": {
    "zone": "acme.com",
    "created": [
      {
        "type": "TXT",
        "name": "delivrie._domainkey.acme.com"
      }
    ],
    "existing": [],
    "skipped": []
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
