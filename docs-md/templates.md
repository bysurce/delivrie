# Templates

Create reusable email templates with variables and fallbacks, publish versions, and send them from the API by id or alias.

Templates keep email design out of your code. Build them in the dashboard's visual or HTML editor (or with the API), publish a version, and send by alias with just the data that changes.

## Create and publish

1. Open [Templates](https://delivrie.io/templates) and click **New template**.
2. Give it an **alias**, a stable name your code sends by, like `order-confirmation`.
3. Write the subject and body using variables (below), set a default From address, and click **Publish**.

Or with the API:

```bash
curl -X POST https://delivrie.io/api/templates \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Order confirmation",
    "alias": "order-confirmation",
    "from": "Acme <orders@mail.acme.com>",
    "subject": "Order {{order_id}} confirmed",
    "html": "<p>Hi {{first_name|there}},</p><p>Order {{order_id}} is on its way.</p>"
  }'

curl -X POST https://delivrie.io/api/templates/order-confirmation/publish \
  -H "Authorization: Bearer $DELIVRIE_API_KEY"
```

Only published versions can be sent. Editing a template doesn't change what's sent until you publish again, and every publish is kept in the version history so you can roll back.

## Send a template

Pass `template` instead of `html`/`text`. `subject` and `from` are optional; the template's defaults are used when you leave them out.

```bash cURL
curl -X POST https://delivrie.io/api/emails \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ada@example.com",
    "template": {
      "id": "order-confirmation",
      "variables": { "first_name": "Ada", "order_id": "#1042" }
    }
  }'
```

```ts Node.js
await delivrie.emails.send({
  from: "Acme <orders@mail.acme.com>",
  to: "ada@example.com",
  template: { id: "order-confirmation", variables: { first_name: "Ada", order_id: "#1042" } },
}); // `subject` comes from the template
```

```python Python
requests.post("https://delivrie.io/api/emails", headers=auth, json={
    "to": "ada@example.com",
    "template": {"id": "order-confirmation", "variables": {"first_name": "Ada", "order_id": "#1042"}},
})
```

`template.id` takes the template's id or its alias.

## Variables

| Syntax | Inserts | Use for |
| --- | --- | --- |
| `{{first_name}}` | The value, HTML-escaped | Anything a user typed: names, messages, addresses |
| `{{{reset_url}}}` | The value exactly as given | HTML snippets and URLs you build yourself |
| `{{first_name\|there}}` | The value, or `there` if it's missing or empty | Friendly fallbacks |

Variables work in the subject, the HTML and the text version. Missing variables without a fallback become an empty string. You can also set a default fallback for each variable in the template editor.

> **Warning:** Never put user input in a `{{{triple}}}` variable. It's inserted unescaped, so someone could inject HTML into your email.

## Broadcast and automation variables

In [broadcasts](/docs/broadcasts), variables come from the contact: `{{first_name}}`, `{{last_name}}`, `{{email}}` and any [contact property](/docs/contacts), like `{{plan}}`. `{{{unsubscribe_url}}}` inserts the recipient's unsubscribe link.

In [automations](/docs/automations), templates can also use the data sent with the triggering event.

## List and fetch

- `GET /templates` lists templates with their alias and status.
- `GET /templates/:id` (id or alias) returns one template.
