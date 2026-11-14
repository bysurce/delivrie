# Get metrics

`GET https://delivrie.io/api/metrics`

Daily totals and rates for delivery, opens, clicks, bounces and complaints.

Access: Needs a full access key.. MCP tool: `get_metrics`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `days` | number | No | Days to include, up to 90. Default: `15`. |
| `domain_id` | string | No | Only one domain. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/metrics' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "totals": {
    "sent": 17402,
    "delivered": 17247,
    "bounced": 104,
    "complained": 3
  },
  "rates": {
    "delivery": 0.991,
    "bounce": 0.006,
    "complaint": 0.0002
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
