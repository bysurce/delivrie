# Templates

Create reusable email templates with variables and fallbacks, publish versions, and send them from the API by id or alias.

Templates keep email design out of your code. Build them in the dashboard's visual or HTML editor (or with the API), publish a version, and send by alias with just the data that changes.

## Create and publish

1. Open [Templates](https://delivrie.io/templates) and click **Create template**. Start from blank or from one of the ready-made templates (below).
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

## Ready-made templates

Delivrie includes 22 designed templates you can start from, each with its variables already set up:

| Category | Templates |
| --- | --- |
| Account | Welcome, Verify email, Sign-in link, Team invitation, Account closed |
| Security | Verification code, Password reset, Password changed, New sign-in alert |
| Billing | Payment receipt, Invoice, Payment failed, Trial ending, Subscription renewed |
| Commerce | Order confirmation, Order shipped, Cart reminder |
| Marketing | Newsletter, Product announcement, Feedback request, Event invitation, We miss you |

They use a card layout: your logo above a white card, the content inside it, and the footer below. They're built with email-safe table layouts and adapt to phone screens. Everything is editable after you create one. Transactional templates have no unsubscribe link; marketing ones do.

## Brand kit

On the Starter plan and above, set your brand once in [Settings → Brand](https://delivrie.io/settings/brand): logo, button and text colours, background, font, button corners, postal address, support email and social links. New templates are created with your brand already applied. To restyle a template or broadcast you already have, open it, click **Styles**, then **Apply brand kit**.

Use a PNG or JPG logo, at least twice the height it's shown at so it stays sharp on high-resolution screens. Most email apps don't show SVG images.

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
- `PATCH /templates/:id` changes its name, alias, sender, subject, variables or `html`. Changes are saved as a draft: emails keep using the published version until you call `POST /templates/:id/publish` again.
- `POST /templates/:id/duplicate` copies it as a new draft, and `DELETE /templates/:id` deletes it.
