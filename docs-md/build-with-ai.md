# Build with AI

Use Delivrie with Claude, Cursor, Codex, v0, Lovable, Bolt and other AI tools: llms.txt, Markdown docs, a rules file for your repo, prompts to paste and the MCP server.

AI coding tools write better email code when they read the right docs. Delivrie publishes everything in formats they understand, and gives your assistant a way to act on your account directly.

## Give your assistant the docs

| URL | What it is |
| --- | --- |
| [delivrie.io/llms.txt](https://delivrie.io/llms.txt) | An index of every guide and API endpoint, with links to Markdown versions |
| [delivrie.io/llms-full.txt](https://delivrie.io/llms-full.txt) | All guides and the full API reference in one Markdown file |
| `https://delivrie.io/docs/<page>.md` | Any docs page as Markdown, for example [/docs/quickstart.md](https://delivrie.io/docs/quickstart.md) or [/docs/api/send-email.md](https://delivrie.io/docs/api/send-email.md) |

Every docs page also has **Copy page** (Markdown for your clipboard) and **Open in Claude** buttons.

In Cursor, add `https://delivrie.io/llms-full.txt` under **Settings → Indexing & Docs → Add Doc**, then type `@Docs` in chat and pick Delivrie. In Claude, ChatGPT or v0, paste the link into your message and ask the assistant to read it.

## Add a rules file to your project

Assistants follow project rules on every request. Save this as `AGENTS.md` (Codex, Cursor, Copilot, Jules and most agents), `CLAUDE.md` (Claude Code) or `.cursor/rules/delivrie.mdc` (Cursor):

```markdown AGENTS.md
## Email: Delivrie

- Send email with Delivrie. Docs: https://delivrie.io/llms.txt (Markdown: append .md to any docs URL).
- Node/TypeScript: use the `delivrie` npm package. `new Delivrie(process.env.DELIVRIE_API_KEY)`.
  Calls return `{ data, error }` and never throw for API errors: always check `error`.
- Other languages: POST https://delivrie.io/api/emails with `Authorization: Bearer $DELIVRIE_API_KEY`
  and JSON `{ from, to, subject, html | text }`.
- Read the key from the DELIVRIE_API_KEY environment variable. Never hard-code it and never call
  Delivrie from browser code: send from a server route, server action or edge function.
- `from` must be on a verified domain, as "Name <address@domain>". Ours is: mail.example.com
- Pass an idempotency key derived from the business event (e.g. `order-${order.id}-receipt`)
  so retries never send twice.
- In tests and local development, send to delivered@test.delivrie.io (or bounced@ / complained@).
- Delivery results arrive as signed webhooks (Standard Webhooks). Verify with `verifyWebhook`
  from the `delivrie` package before trusting a payload.
```

Change `mail.example.com` to your verified domain.

## Prompts to paste

Start a new chat with one of these, filling in the brackets.

```text Add email
Add transactional email to this app with Delivrie (https://delivrie.io/llms-full.txt).
Send a [welcome email] when [a user signs up]. Use the `delivrie` npm package
(or plain fetch to https://delivrie.io/api/emails if this isn't a JS project),
read DELIVRIE_API_KEY from the environment, send only from server code,
use "[App name] <[hello@mail.example.com]>" as the sender, and pass an
idempotency key based on the user id. Show me where to add the env var.
```

```text Webhooks
Using Delivrie webhooks (https://delivrie.io/docs/webhooks.md), add an endpoint at
[/api/webhooks/delivrie] that verifies the signature with `verifyWebhook` from the
`delivrie` package using DELIVRIE_WEBHOOK_SECRET, reads the raw request body before
parsing it, and [marks the user's email as invalid] on email.bounced and
email.complained. Return 200 quickly and 400 when the signature is wrong.
```

```text Migrate
Migrate this project from Resend to Delivrie following
https://delivrie.io/docs/migrate-from-resend.md. Keep behaviour the same,
change only what the guide says, and list the environment variables I need to set.
```

```text v0 / Lovable / Bolt
Add a contact form that emails me through Delivrie. Create a server route
(never call Delivrie from the browser) that POSTs to https://delivrie.io/api/emails
with Authorization: Bearer ${DELIVRIE_API_KEY}, from "[Site] <[forms@mail.example.com]>",
to "[me@example.com]", reply_to the visitor's email, and the message as text.
Show a success state, and an error state using the API's error message.
```

## Let the assistant use your account (MCP)

The [MCP server](/docs/mcp) at `https://delivrie.io/api/mcp` gives assistants 92 tools: send email, check delivery, add domains, manage contacts, broadcasts and templates, read logs and reply to inbox threads. You approve which team and scopes it can use, and you can revoke it under Settings → Connected apps.

```bash Claude Code
claude mcp add --transport http delivrie https://delivrie.io/api/mcp
```

```json Cursor
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "delivrie": { "url": "https://delivrie.io/api/mcp" }
  }
}
```

```toml Codex
# ~/.codex/config.toml
[mcp_servers.delivrie]
command = "npx"
args = ["-y", "mcp-remote", "https://delivrie.io/api/mcp"]
```

```text v0
v0 → Settings → MCP connections → Add custom connection
Name     Delivrie
URL      https://delivrie.io/api/mcp
Header   Authorization: Bearer dlv_your_key
```

Then ask things like "Send a test email to delivered@test.delivrie.io from onboarding@delivrie.io", "Why did my last email to ada@example.com bounce?" or "Add mail.example.com and tell me which DNS records to create". [MCP server](/docs/mcp) has setup for Claude Desktop, ChatGPT, Antigravity and VS Code, plus the full tool list.

## Check your assistant's work

AI-written email code usually fails in one of these ways:

- **The key is in client code.** Search the project for `dlv_` and for `delivrie.io/api` in files that run in the browser. Move those calls to the server.
- **Errors are ignored.** With the SDK, check `error` on every call. With `fetch`, check `res.ok`; the body's `message` explains the problem.
- **No idempotency key,** so a retried request sends the email twice.
- **Webhook body parsed before verification.** Signature checks need the raw body exactly as received.
- **Unverified sender.** `from` must use a domain verified in your Delivrie team, or `onboarding@delivrie.io` while testing.
