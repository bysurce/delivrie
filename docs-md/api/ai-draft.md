# Draft email with AI

`POST https://delivrie.io/api/ai/draft`

Write an email in the team's brand voice from a web page, a brief, or both. Returns subject, preview text and editor blocks. With target, writes it straight into a template or draft broadcast, and anyone with it open sees it arrive.

Access: Needs a full access key.. MCP tool: `ai_draft_email`.

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | No | A page to write from: a blog post, changelog, product or event page. |
| `brief` | string | No | What the email is for. Provide url, brief or both. |
| `kind` | string | No | broadcast or template. Default: `broadcast`. |
| `length` | string | No | short, medium or long. Default: `medium`. |
| `tone` | string | No | A tone for this email, on top of the brand voice. |
| `variables` | string[] | No | Variables the email may use, like first_name. |
| `target` | object | No | { type: "template" \| "broadcast", id } to write into. |

## Example request

```bash
curl -X POST 'https://delivrie.io/api/ai/draft' \
  -H 'Authorization: Bearer dlv_live_••••' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://acme.com/blog/new-dashboard",
    "brief": "Announce it to customers",
    "length": "short"
  }'
```

## Response

```json
{
  "object": "ai_draft",
  "subject": "The new dashboard is here",
  "preview_text": "Twice as fast, live today",
  "content": {
    "blocks": [
      {
        "id": "k2x9a1b",
        "type": "title",
        "html": "Meet the new dashboard"
      }
    ]
  },
  "notes": "Check the pricing link.",
  "source": {
    "url": "https://acme.com/blog/new-dashboard",
    "title": "Introducing the new dashboard"
  }
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
