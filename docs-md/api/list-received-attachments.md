# List received attachments

`GET https://delivrie.io/api/emails/received/:id/attachments`

The files of a received email with download links that last an hour. Files are kept for 30 days.

Access: Needs a full access key.. MCP tool: `list_attachments`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The received email id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/emails/received/4ef9a417/attachments' \
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
      "filename": "photo.jpg",
      "content_type": "image/jpeg",
      "size": 248213,
      "download_url": "https://…",
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
