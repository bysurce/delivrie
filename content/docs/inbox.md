---
title: Inbox
group: Receiving
order: 2
description: Inboxes for people and agents: an inbox per address, an agent that drafts replies, labels and filters spam, shared drafts, internal notes, assignment, Gmail-style search, and the API and MCP tools behind them.
---
The [Inbox](https://delivrie.io/inbox) groups [received email](/docs/receiving) into conversations so your team, and an AI agent, can read, sort and answer them in one place.

## Inboxes

An inbox is an address on a receiving domain, like `support@in.acme.com` or `sales@in.acme.com`. Mail to that address lands in it. Create one from the inbox menu in the dashboard (**New inbox**) or with `POST /inboxes`. Each address that already had mail became an inbox automatically. Mail to addresses without an inbox still arrives and shows under **Other mail**.

If the domain only accepts specific addresses, creating an inbox adds its address to that list. If the domain receives on a subdomain (like `in.acme.com`), the inbox has to use an address there.

## The inbox agent

Each inbox can have an agent that reads every new email and acts on it within the limits you set. Turn it on in the inbox's settings, write instructions in plain language (what the inbox is for, your policies, links to share, who handles what), pick a tone, and choose what it may do:

| Action | What the agent does |
| --- | --- |
| Draft replies | Writes a reply in the conversation for someone to review and send. **It never sends replies itself.** |
| Add labels | Sorts conversations with your labels, creating new ones when needed |
| Mark spam | Moves scams, phishing and bulk mail to Spam |
| Archive | Files mail that needs no reply, like receipts and notifications |
| Assign | Hands the conversation to someone on your team |
| Add notes | Leaves an internal note. Notes are never emailed |
| Forward | Forwards mail, but only to the addresses you list in its settings (up to 5) |

Email is written by people outside your team, so the agent treats it as untrusted text: it only has the actions you allowed, it can't forward anywhere you didn't list, and it ignores instructions inside an email that try to change what it does. Every run is logged with what it did, shown at the top of the conversation and in the inbox's settings. You can also run it on any conversation from the thread's menu (**Run agent**) or with `POST /inbox/threads/:id/agent`.

Agent runs a month, across all inboxes: Free 100, Starter 1,000, Pro 3,000, Scale 10,000, Enterprise unlimited.

## Conversations

A message joins an existing thread when it replies to an earlier message (its `In-Reply-To` or `References` header points at one), or when the same person writes to the same address with the same subject within 30 days. Otherwise it starts a new thread. Replies you send from the Inbox join their thread with the right headers, so they stay in the same conversation in the customer's mail app.

Each thread has an inbox, a contact, a subject, a snippet, unread status, labels, an assignee and a folder: `open`, `archived`, `spam` or `trash`. `needs_reply` is `true` when the latest message is from the contact. A new conversation that the receiving server flags as spam starts in Spam.

- **Drafts** are shared by the team. A reply you start in the dashboard saves as you type, so a teammate can pick it up. The agent's drafts appear in the reply box with its note on what to check.
- **Notes** are internal comments on a conversation, from your team or the agent. They're never emailed.
- **Assignment** gives a conversation an owner. **Assigned to me** lists yours.

## Search

The search box and the API's `q` parameter take Gmail-style syntax. Combine as many as you like:

| Example | Finds |
| --- | --- |
| `refund "charged twice"` | Words and exact phrases in the subject, contact or latest message |
| `from:maria` `to:sales@` `subject:invoice` | Sender, the inbox address, or the subject |
| `label:billing` | Conversations with that label |
| `is:unread` `is:read` `is:assigned` `is:unassigned` `is:needs-reply` | Status |
| `in:archive` `in:spam` `in:trash` `in:anywhere` | A folder other than the open inbox |
| `has:attachment` `has:draft` | Conversations with attachments, or with an open draft |
| `after:2026-11-01` `before:2026-12-01` | By the latest message's date |

## API

| Request | What it does |
| --- | --- |
| `GET /inboxes` | List inboxes with open, unread and needs-reply counts and their agent settings |
| `POST /inboxes` | Create an inbox: `{ "address": "support@in.acme.com", "name": "Support" }` |
| `PATCH /inboxes/:id` | Change `name`, `description` or `agent` (see below). `:id` can be the inbox's id or address |
| `DELETE /inboxes/:id` | Remove an inbox. Its conversations move to Other mail |
| `GET /inboxes/:id/agent-runs` | The agent's recent runs, with what it did |
| `GET /inbox/threads` | List threads, newest first. Filters: `inbox` (id, address or `none`), `status` (`open`, the default, `archived`, `spam`, `trash` or `all`), `unread=true`, `needs_reply=true`, `assignee` (`me`, an email or `none`), `label`, `q` (search syntax above), `limit` |
| `GET /inbox/threads/:id` | A thread with its messages as text, notes, open drafts and recent agent runs |
| `POST /inbox/threads/:id/reply` | Reply with `{ "text": "..." }` or `{ "html": "..." }`. Optional `from`, `cc`, and `draft_id` to mark a draft as sent |
| `PATCH /inbox/threads/:id` | Change `status`, `unread`, `assignee` (an email, `me` or `null`) or `labels` (names; new labels are created) |
| `POST /inbox/threads/:id/agent` | Run the inbox's agent on this conversation now |
| `GET` / `POST /inbox/threads/:id/notes` | List notes, or add one with `{ "body": "..." }` |
| `DELETE /inbox/notes/:id` | Delete a note |
| `GET /inbox/drafts` | Open drafts. Filters: `thread_id`, `inbox`, `source` (`user` or `agent`) |
| `POST /inbox/drafts` | Save a draft: a reply with `thread_id`, or a new email with `inbox`; plus `to`, `cc`, `bcc`, `subject`, `text` or `html` |
| `PATCH /inbox/drafts/:id` | Edit a draft |
| `POST /inbox/drafts/:id/send` | Send a draft (replies keep their threading) |
| `DELETE /inbox/drafts/:id` | Discard a draft |
| `GET /inbox/labels` | List labels |

The `agent` object: `enabled` (boolean), `instructions` (up to 4,000 characters), `tone` (`friendly`, `professional`, `concise` or your own words), `actions` (any of `draft_reply`, `add_labels`, `archive`, `mark_spam`, `assign`, `add_note`, `forward`), `forward_to` (up to 5 addresses, required for `forward`) and `signature`. Changing inboxes and their agent needs a full access key, or the `manage` scope for connected apps.

```bash
# Turn on the agent for the support inbox
curl -X PATCH https://delivrie.io/api/inboxes/support@in.acme.com \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "agent": { "enabled": true, "instructions": "We sell Acme Projects. Refunds within 30 days of purchase. Billing questions go to Sam.", "actions": ["draft_reply", "add_labels", "mark_spam", "assign"] } }'

# Unread billing conversations that need an answer
curl -G "https://delivrie.io/api/inbox/threads" --data-urlencode "q=label:billing is:unread is:needs-reply" \
  -H "Authorization: Bearer $DELIVRIE_API_KEY"

# Send the agent's draft after checking it
curl -X POST https://delivrie.io/api/inbox/drafts/DRAFT_ID/send -H "Authorization: Bearer $DELIVRIE_API_KEY"
```

The Inbox has its own [webhook events](/docs/webhooks): `inbox.email.received`, `inbox.thread.updated`, `inbox.draft.created`, `inbox.agent.completed`, and `inbox.created`, `inbox.updated` and `inbox.deleted`.

## Work the Inbox from your own agent

Connect an assistant to the [MCP server](/docs/mcp) and it can use the same features: `list_inboxes`, `list_inbox_threads` (with search), `get_inbox_thread`, `create_draft`, `send_draft`, `reply_to_thread`, `update_thread`, `add_thread_note`, `run_inbox_agent` and `update_inbox`. For example, in Claude:

```text
Check the support inbox in Delivrie for conversations that need a reply.
For each one, read it and save a draft answer using our refund policy (below).
Don't send anything: I'll review the drafts. Label each one "billing" or "bug".
```

Approve the `read` and `send` scopes, and leave out `manage`, if the agent should read, draft and reply but not change inbox settings.
