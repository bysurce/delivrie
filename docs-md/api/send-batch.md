# Send batch

`POST https://delivrie.io/api/emails/batch`

Send up to 100 emails in one request, each with its own recipients and content. Batch emails can't have attachments or scheduled_at.

Access: Sending or full access. MCP tool: `send_batch`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer token. |
| `Idempotency-Key` | string | No | Makes the whole batch safe to retry. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `[ ]` | object[] | Yes | An array of up to 100 email objects with the same fields as Send email. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/emails/batch' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '[
    {
      "from": "Acme <orders@acme.com>",
      "to": [
        "ada@example.com"
      ],
      "subject": "Receipt",
      "html": "<p>Order 1</p>"
    },
    {
      "from": "Acme <orders@acme.com>",
      "to": [
        "sam@example.com"
      ],
      "subject": "Receipt",
      "html": "<p>Order 2</p>"
    }
  ]'
```

## Response

```json
{
  "data": [
    {
      "id": "4ef9a417-…"
    },
    {
      "id": "9a1c22b0-…"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 422 | `validation_error` | More than 100 emails, or an email uses attachments or scheduled_at. |
