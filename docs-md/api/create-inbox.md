# Create inbox

`POST https://delivrie.io/api/inboxes`

Create an inbox for an address on a receiving domain. Mail to that address lands in it. On a domain that only accepts specific addresses, the address is added to the list.

Access: Needs a full access key.. MCP tool: `create_inbox`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | Yes | An address on a receiving domain, e.g. support@in.acme.com. |
| `name` | string | No | Display name. Defaults to the address's local part. |
| `description` | string | No | What the inbox is for. |
| `agent` | object | No | Agent settings (see Update inbox). |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/inboxes' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "address": "support@in.acme.com",
    "name": "Support"
  }'
```

## Response

```json
{
  "object": "inbox",
  "id": "be19…",
  "name": "Support",
  "address": "support@in.acme.com",
  "agent": {
    "enabled": false
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 422 | `validation_error` | The address isn't on a domain with receiving turned on, or already has an inbox. |
