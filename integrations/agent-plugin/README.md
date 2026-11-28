# Delivrie plugin for Claude Code, Cursor and Codex

Adds Delivrie to your coding agent:

- **MCP server** (`https://delivrie.io/api/mcp`, OAuth): send test emails, check domains and delivery logs, manage contacts and webhooks, and edit templates and broadcasts live in the Delivrie editor.
- **Skills**: `send-email` (the right SDK and the rules that keep sending safe), `email-webhooks`, `email-content` (live template edits) and `migrate-from-resend`.
- **Cursor rule** `delivrie` and the **`/delivrie-setup`** command.

## Install

**Claude Code**

```text
/plugin marketplace add bysurce/delivrie
/plugin install delivrie@delivrie
```

**Cursor**: Settings → Plugins → Add marketplace → `bysurce/delivrie`, then install **delivrie**.

**Codex**: add the marketplace with `codex plugin marketplace add bysurce/delivrie`, then enable `delivrie` in `/plugins`.

The first time the agent uses a Delivrie tool, you sign in to Delivrie and choose the team and what it may do (read, send, manage).

The same folder carries each tool's manifest: `.claude-plugin/plugin.json` (Claude Code), `.cursor-plugin/plugin.json` (Cursor) and `plugin.json` (Codex and other Agent Plugins hosts). The marketplaces are at the repository root.
