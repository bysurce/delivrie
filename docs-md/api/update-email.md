# Update email

`PATCH https://delivrie.io/api/emails/:id`

Reschedule an email that hasn't been sent yet.

Access: Sending or full access.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The email id. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `scheduled_at` | string | Yes | New send time: ISO 8601 or a phrase like "in 2 hours". |

## Example request

```bash
curl -X PATCH 'https://delivrie.io/api/emails/4ef9a417' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "scheduled_at": "tomorrow at 9am"
  }'
```

## Response

```json
{
  "object": "email",
  "id": "4ef9a417-…"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 422 | `validation_error` | Only scheduled emails can be updated. |
