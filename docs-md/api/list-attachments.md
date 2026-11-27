# List attachments

`GET https://delivrie.io/api/emails/:id/attachments`

The files of a sent email with download links. For received mail use GET /emails/received/:id/attachments. Links last an hour; files are kept for 30 days, like email content. GET /emails/:id/attachments/:attachment_id returns one.

Access: Needs a full access key.. MCP tool: `list_attachments`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The email id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/emails/4ef9a417/attachments' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "attachment",
      "id": "att_1",
      "filename": "invoice.pdf",
      "content_type": "application/pdf",
      "size": 48213,
      "download_url": "https://…/attachments/…?token=…",
      "expires_at": "2026-11-28T10:12:04Z"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
