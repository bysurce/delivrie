# Claude Code, Cursor and Codex

Install the Delivrie plugin in Claude Code, Cursor or Codex to add email to your app with the right SDK, and to send test emails, check domains and logs, and edit templates from your coding agent.

The Delivrie plugin gives your coding agent two things:

- **Skills** that teach it to add email the safe way: the right SDK for your language, the key in `DELIVRIE_API_KEY`, a verified sender, idempotency keys, test addresses and signed webhooks. Plus skills for webhooks, editing email content and migrating from Resend.
- **Delivrie's [MCP server](/docs/mcp)**, so it can work with your account: send a test email and confirm delivery, list domains and their DNS status, read logs, create webhooks, and edit templates and broadcasts live in the Delivrie editor.

## Claude Code

```text
/plugin marketplace add bysurce/delivrie
/plugin install delivrie@delivrie
```

Then try `/delivrie-setup`, or ask "add a welcome email to this app with Delivrie".

## Cursor

Open **Settings → Plugins**, add the marketplace `bysurce/delivrie` and install **delivrie**. It also adds a `delivrie` rule that applies to your mail and webhook code.

## Codex

```bash
codex plugin marketplace add bysurce/delivrie
```

Then enable **Delivrie** in `/plugins`. In ChatGPT, use the [Delivrie app](/docs/mcp) instead.

## Signing in

The first time the agent calls a Delivrie tool, your browser opens Delivrie's sign-in. Choose the team and what the agent may do: **send**, **read** and **manage**. Leave out **manage** if it should only send test emails and read logs. Revoke access any time in [Settings → Connected apps](https://delivrie.io/settings/connected-apps).

The plugin's source is in [integrations/agent-plugin](https://github.com/bysurce/delivrie/tree/main/integrations/agent-plugin).
