# Send email

`POST https://delivrie.io/api/emails`

Send a transactional email. Returns the email id immediately; delivery events arrive through webhooks and the Logs page.

Access: Sending or full access. MCP tool: `send_email`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer token. Any API key works, including sending-only keys. |
| `Idempotency-Key` | string | No | Unique key for this request. Retrying with the same key returns the original email instead of sending again. |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | string | Yes | Sender address on a verified domain. Use "Name <email@domain>" to set a display name. |
| `to` | string \| string[] | Yes | Recipient address or up to 50 addresses. |
| `subject` | string | Yes | Email subject line. Optional when you send a template. |
| `html` | string | No | HTML body. Provide html, text or template. |
| `text` | string | No | Plain-text body. Generated from html when omitted. Default: `auto`. |
| `cc` | string \| string[] | No | Carbon-copy recipients. |
| `bcc` | string \| string[] | No | Blind carbon-copy recipients. |
| `reply_to` | string \| string[] | No | Where replies go. |
| `template` | object | No | Send a published template: { "id": "alias-or-id", "variables": { … } }. |
| `scheduled_at` | string | No | ISO 8601 date or a phrase like "in 1 hour" or "tomorrow at 9am" (UTC). Up to 30 days ahead. |
| `tags` | object[] | No | Name/value pairs attached to the email and its webhook events. Letters, numbers, _ and - only. |
| `headers` | object | No | Custom email headers. |
| `attachments` | object[] | No | { filename, content } with base64 content. Up to 40 MB per email. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/emails' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "Acme <orders@acme.com>",
    "to": [
      "ada@example.com"
    ],
    "subject": "Your order is confirmed",
    "html": "<p>Thanks for your order!</p>",
    "tags": [
      {
        "name": "category",
        "value": "receipt"
      }
    ]
  }'
```

## Response

```json
{
  "id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 401 | `invalid_api_key` | The key doesn't exist or was deleted. |
| 403 | `restricted_api_key` | This sending key is limited to a different domain. |
| 422 | `validation_error` | A required field is missing or malformed, or the from domain isn't verified on this team. The message says which. |
| 429 | `daily_quota_exceeded` | Free plan limit of 133 emails a day reached. |
| 429 | `monthly_quota_exceeded` | Free plan monthly limit reached and no credits left. |
| 429 | `spending_cap_reached` | This send would take overage past your spending cap. |
