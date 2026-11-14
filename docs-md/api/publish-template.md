# Publish template

`POST https://delivrie.io/api/templates/:id/publish`

Make the current draft the live version. Every publish is kept in version history.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Template id or alias. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/templates/4ef9a417/publish' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "template",
  "id": "t_2…",
  "version": 3,
  "warnings": []
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
