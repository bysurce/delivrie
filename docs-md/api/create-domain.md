# Create domain

`POST https://delivrie.io/api/domains`

Add a sending domain. The response includes the DNS records to add at your DNS provider.

Access: Needs a full access key.. MCP tool: `create_domain`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | The domain or subdomain, for example mail.kora.ng. |
| `region` | string | No | Sending region. Default: `eu-west-1`. |
| `return_path` | string | No | Subdomain used for bounces and SPF. Default: `send`. |
| `click_tracking` | boolean | No | Rewrite links to track clicks. Default: `false`. |
| `open_tracking` | boolean | No | Add a tracking pixel. Default: `false`. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/domains' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "mail.kora.ng",
    "region": "eu-west-1"
  }'
```

## Response

```json
{
  "object": "domain",
  "id": "d91e…",
  "name": "mail.kora.ng",
  "status": "pending",
  "records": [
    {
      "record": "DKIM",
      "type": "TXT",
      "name": "delivrie._domainkey.mail",
      "status": "pending"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 403 | `plan_limit_reached` | Your plan's domain limit is reached. |
| 422 | `validation_error` | The domain name isn't valid or is already added. |
