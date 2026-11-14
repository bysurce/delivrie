# Replay delivery

`POST https://delivrie.io/api/webhook-deliveries/:id/replay`

Send a past delivery again and return the new attempt.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The delivery id. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/webhook-deliveries/4ef9a417/replay' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "id": "wd_5…",
  "status_code": 200,
  "attempts": 2,
  "delivered": true
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
