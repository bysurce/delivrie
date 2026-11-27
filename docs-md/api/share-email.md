# Share email

`POST https://delivrie.io/api/emails/:id/share`

Create a link anyone can open to see the email and its delivery timeline, without signing in. DELETE /emails/:id/share revokes every link for the email.

Access: Needs a full access key.. MCP tool: `share_email`.

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
| `expires_in_hours` | number | No | How long the link works, 1 to 720. Default: `24`. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/emails/4ef9a417/share' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "expires_in_hours": 72
  }'
```

## Response

```json
{
  "object": "email_share",
  "email_id": "4ef9a417-…",
  "url": "https://delivrie.io/share/8c1f…",
  "expires_at": "2026-12-01T09:12:04Z"
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
