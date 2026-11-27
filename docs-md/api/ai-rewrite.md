# Rewrite blocks

`POST https://delivrie.io/api/ai/rewrite`

Rewrite blocks with an instruction, in the brand voice. Ids, variables, links and styles are kept unless the instruction changes them. POST /ai/subjects with { text } suggests subject lines.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `blocks` | object[] | Yes | The blocks to rewrite. |
| `instruction` | string | Yes | How, e.g. "shorter" or "add a line about the free trial". |
| `kind` | string | No | broadcast or template. |
| `context` | string | No | The rest of the email as text, for context. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/ai/rewrite' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "blocks": [
      {
        "id": "b2",
        "type": "text",
        "html": "We are very excited to announce our brand new dashboard."
      }
    ],
    "instruction": "Shorter and plainer"
  }'
```

## Response

```json
{
  "object": "ai_rewrite",
  "blocks": [
    {
      "id": "b2",
      "type": "text",
      "html": "The new dashboard is here."
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
