# Send test event

`POST https://delivrie.io/api/webhooks/:id/test`

Send a sample event to the endpoint and return the delivery attempt.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The webhook id. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/webhooks/4ef9a417/test' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "id": "wd_5…",
  "event_type": "email.delivered",
  "status_code": 200,
  "attempts": 1,
  "delivered": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
