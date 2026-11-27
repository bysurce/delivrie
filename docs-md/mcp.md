# Delivrie MCP server

Connect AI assistants to Delivrie with the remote MCP server at `https://delivrie.io/api/mcp` (streamable HTTP).
Clients that support OAuth open a Delivrie page where you pick the team and approve scopes (`send`, `read`, `manage`); revoke access under Settings → Connected apps.
Clients without OAuth can send an API key as `Authorization: Bearer dlv_your_key`.

## Install

### Claude (Claude Code, Desktop & claude.ai)

Remote · OAuth. terminal:

```bash
# Claude Code: opens a Delivrie page to approve access
claude mcp add --transport http delivrie https://delivrie.io/api/mcp

# Claude Desktop & claude.ai: Settings → Connectors → Add custom connector
# URL https://delivrie.io/api/mcp
```

### Cursor (Agent mode & Composer)

Remote · OAuth. ~/.cursor/mcp.json:

```json
{
  "mcpServers": {
    "delivrie": { "url": "https://delivrie.io/api/mcp" }
  }
}
```

### Codex (OpenAI Codex CLI & IDE)

Local bridge. ~/.codex/config.toml:

```toml
[mcp_servers.delivrie]
command = "npx"
args = ["-y", "mcp-remote", "https://delivrie.io/api/mcp"]
# mcp-remote opens the Delivrie approval page on first run
```

### v0 (v0 by Vercel)

Remote · API key. v0 → Settings → MCP connections:

```text
# Add a custom MCP connection
Name     Delivrie
URL      https://delivrie.io/api/mcp
Header   Authorization: Bearer dlv_live_••••
```

### Antigravity (Google Antigravity agents)

Remote · OAuth. Settings → Customizations → Open MCP Config, then Refresh and Authenticate:

```json
{
  "mcpServers": {
    "delivrie": { "serverUrl": "https://delivrie.io/api/mcp" }
  }
}
```

### VS Code (GitHub Copilot agent mode)

Remote · OAuth. terminal:

```bash
code --add-mcp '{"name":"delivrie","type":"http","url":"https://delivrie.io/api/mcp"}'
```

## Tools (92)

| Tool | What it does | Scope |
| --- | --- | --- |
| `send_email` | Send one email from a verified domain | send |
| `send_batch` | Send up to 100 emails in one call | send |
| `list_emails` | Recent sent emails with their latest status (delivered, opened, bounced…) | read |
| `get_email` | One email (sent or received) with its content and every delivery event | read |
| `reschedule_email` | Change when a scheduled email goes out | send |
| `cancel_email` | Cancel an email that is scheduled and not yet sent | send |
| `list_received_emails` | Emails that arrived on your receiving domains, newest first | read |
| `forward_email` | Forward an email (usually a received one) to other people, with an optional note | send |
| `list_inboxes` | Inboxes on your receiving domains (support@, sales@…), with open, unread and needs-reply counts and each inbox's agent settings | read |
| `create_inbox` | Create an inbox for an address on a receiving domain, e.g | manage |
| `update_inbox` | Rename an inbox or set up its agent | manage |
| `list_inbox_threads` | Conversations in the Inbox | read |
| `get_inbox_thread` | A conversation with every message as plain text, oldest first | read |
| `reply_to_thread` | Reply in an Inbox conversation | send |
| `update_thread` | Archive or reopen a thread, mark it read or unread, or set its labels (labels are created if they don't exist) | send |
| `list_inbox_labels` | Labels you can put on inbox threads | read |
| `add_thread_note` | Leave an internal note on a conversation for the team | send |
| `list_drafts` | Open drafts in the Inbox, including the ones the inbox agent wrote | read |
| `create_draft` | Save a draft for the team to review: a reply in a thread (thread_id) or a new email from an inbox | send |
| `update_draft` | Edit a draft's recipients, subject or body | send |
| `send_draft` | Send a draft | send |
| `discard_draft` | Discard a draft without sending it | send |
| `run_inbox_agent` | Run the inbox's agent on a conversation now, using the inbox's agent settings | send |
| `list_domains` | Sending domains with status, region, tracking and receiving settings | read |
| `get_domain` | A domain and the DNS records to add, with each record's status | read |
| `create_domain` | Add a sending domain and get its DNS records | manage |
| `verify_domain` | Check DNS now and update the domain's verification status | read |
| `update_domain` | Change tracking, TLS or receiving | manage |
| `delete_domain` | Remove a domain | manage |
| `claim_domain` | Start claiming a domain another Delivrie team added | manage |
| `verify_domain_claim` | Check the claim TXT record and move the domain to this team when it's found | manage |
| `list_contacts` | Contacts, newest first | read |
| `get_contact` | A contact by id or email | read |
| `create_contact` | Create or update a contact by email, optionally adding it to segments | manage |
| `update_contact` | Change a contact's name, properties or subscription | manage |
| `delete_contact` | Delete a contact | manage |
| `list_contact_properties` | Custom contact properties and their fallbacks | read |
| `list_segments` | Segments used to target broadcasts and automations | read |
| `create_segment` | Create a segment | manage |
| `add_contacts_to_segment` | Add contacts (by email) to a segment, creating them if needed | manage |
| `delete_segment` | Delete a segment (contacts stay) | manage |
| `list_topics` | Topics people can opt out of on the unsubscribe page | read |
| `list_broadcasts` | Broadcasts with status and schedule | read |
| `get_broadcast` | A broadcast with delivery stats | read |
| `create_broadcast` | Create a broadcast draft for a segment | manage |
| `send_broadcast` | Send a broadcast now, or schedule it with scheduled_at | manage |
| `cancel_broadcast` | Cancel a scheduled broadcast (it goes back to draft) | manage |
| `list_templates` | Templates with alias and published version | read |
| `get_template` | A template by id or alias, with its content and variables | read |
| `create_template` | Create a template | manage |
| `publish_template` | Publish the current draft so API sends and automations use it | manage |
| `list_automations` | Automations with trigger and status (draft, live, paused) | read |
| `get_automation` | An automation's trigger, steps and run counts | read |
| `create_automation` | Create a simple automation: a trigger (an event name or a segment) and a list of send/wait steps | manage |
| `publish_automation` | Publish (or republish) an automation so it starts running | manage |
| `pause_automation` | Pause a live automation | manage |
| `resume_automation` | Resume a paused automation | manage |
| `list_automation_runs` | Recent runs of an automation, with each step's log | read |
| `send_event` | Record an event for a contact (e.g | send |
| `list_events` | Without a name: every event your app has sent, with its fields | read |
| `list_webhooks` | Webhook endpoints and their events | read |
| `create_webhook` | Create a webhook endpoint | manage |
| `list_webhook_events` | Recent delivery attempts for a webhook with status codes | read |
| `test_webhook` | Send a test event to a webhook and return the response | manage |
| `replay_webhook_delivery` | Send a past webhook delivery again | manage |
| `update_broadcast` | Edit a draft broadcast: name, from, reply_to, subject, preview_text, segment_id, topic_id, or html to replace its content | manage |
| `duplicate_broadcast` | Copy a broadcast as a new draft | manage |
| `list_broadcast_recipients` | Who a broadcast went to, with delivered/opened/clicked/bounced flags per person, or who it will reach before it's sent | read |
| `list_broadcast_links` | Links clicked in a broadcast with total and unique clicks | read |
| `duplicate_automation` | Copy an automation (trigger and steps) as a new draft | manage |
| `update_template` | Change a template's name, alias, from, subject, variables or html | manage |
| `duplicate_template` | Copy a template as a new draft | manage |
| `update_segment` | Rename a segment | manage |
| `list_segment_contacts` | The contacts in a segment | read |
| `remove_contacts_from_segment` | Take contacts (emails or ids) out of a segment | manage |
| `import_contacts` | Import up to 50,000 contacts from CSV text (with an email column) or a list, optionally into segments | manage |
| `get_contact_import` | An import's progress: created, updated, skipped and errors | read |
| `list_attachments` | The files of a sent or received email with download links (valid for an hour) | read |
| `share_email` | Create a public link to an email and its delivery timeline, valid for 1 to 720 hours (default 24) | manage |
| `update_api_key` | Rename an API key | manage |
| `get_email_content` | The blocks of a template or draft broadcast, with block ids and the block types you can write | read |
| `edit_email_content` | Edit a template or draft broadcast block by block | manage |
| `ai_draft_email` | Write an email in the team's brand voice from a web page (url) and/or a brief, using Delivrie's AI writer | manage |
| `list_suppressions` | Addresses Delivrie won't send to (bounces, complaints, manual) | read |
| `add_suppression` | Stop sending to one or more addresses | manage |
| `remove_suppression` | Allow sending to an address again | manage |
| `get_metrics` | Sent, delivered, opened, clicked, bounced and complained totals and rates | read |
| `list_logs` | Recent API requests with status codes | read |
| `get_log` | One API request with its request and response bodies | read |
| `get_usage` | Plan, emails sent this month and today, the allowance, and pay-as-you-go credits | read |
| `list_api_keys` | API keys (tokens are never shown) | read |
| `create_api_key` | Create an API key | manage |
