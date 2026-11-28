---
name: email-content
description: Write or edit the content of Delivrie email templates and broadcasts (subject, copy, buttons, layout) through the Delivrie MCP server, live in the user's editor. Use when the user asks to write, improve or change an email's content.
---
# Edit email content in Delivrie

Needs the Delivrie MCP tools. Anyone with the email open in the Delivrie editor sees your changes appear within seconds and can undo them.

1. Find the email: `list_templates` or `list_broadcasts` (only draft broadcasts can be edited).
2. Read it with `get_email_content` (`type`: `template` or `broadcast`, `id`). Blocks have ids and types: `title`, `heading`, `eyebrow`, `text`, `bulleted`, `numbered`, `callout`, `button`, `image`, `rows`, `divider`, `spacer`, `otp`, `footer`. Text fields take inline HTML (`<b>`, `<i>`, `<a href>`, `<br>`).
3. Change it with `edit_email_content` using small operations rather than replacing everything, and pass a one-line `summary` of what you changed:
   - `{ "op": "update", "id": "b2", "set": { "html": "…" } }`
   - `{ "op": "insert", "after": "b2", "block": { "type": "button", "text": "Read more", "href": "https://…" } }`
   - `{ "op": "replace", "id": "b3", "block": { … } }`, `{ "op": "delete", "id": "b4" }`, `{ "op": "move", "id": "b5", "before": "b1" }`
4. Keep `{{variables}}`, links and the unsubscribe footer unless asked. Don't invent facts, prices or URLs.
5. Template changes stay a draft: tell the user to publish (or call `publish_template` if they asked you to).

To write a new email from a web page or brief in the team's brand voice, use `ai_draft_email` (with `target` to write it straight into a template or draft broadcast).
