# Import contacts

`POST https://delivrie.io/api/contacts/imports`

Import up to 50,000 contacts from CSV text or a list. The import runs in the background: check it with GET /contacts/imports/:id (or list them with GET /contacts/imports), or listen for contact.import.completed. Columns other than email, first_name, last_name and unsubscribed become contact properties.

Access: Needs a full access key.. MCP tool: `import_contacts`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `csv` | string | No | CSV text with a header row and an email column. Provide csv or contacts. |
| `contacts` | object[] | No | { email, first_name, last_name, unsubscribed, properties } objects, or plain emails. |
| `columns` | object | No | Maps CSV headers to fields, e.g. { "E-mail": "email", "Company": "property:company", "Notes": null }. |
| `segment_ids` | string[] | No | Add every imported contact to these segments. |
| `update_existing` | boolean | No | Update names and properties of contacts that already exist. false leaves them as they are. Default: `true`. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/contacts/imports' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "csv": "email,first_name,company\nada@example.com,Ada,Analytical Engines",
    "segment_ids": [
      "s_1…"
    ]
  }'
```

## Response

```json
{
  "object": "contact_import",
  "id": "i_4…",
  "status": "queued",
  "total": 1,
  "processed": 0,
  "created": 0,
  "updated": 0,
  "skipped": 0
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
