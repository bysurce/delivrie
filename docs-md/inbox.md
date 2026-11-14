# Inbox

A shared inbox for received email: conversations grouped into threads, labels, archiving, replies from the dashboard or API, and AI agents that answer through MCP.

The [Inbox](https://delivrie.io/inbox) groups [received email](/docs/receiving) into conversations so your team, or an AI agent, can read and reply in one place.

## How threads work

A message joins an existing thread when it replies to an earlier message (its `In-Reply-To` or `References` header points at one), or when the same person writes to the same address with the same subject within 30 days. Otherwise it starts a new thread. Replies you send from the Inbox join their thread.

Each thread has a mailbox (the address mail arrived at), a contact (the other person), a subject, a snippet of the latest message, unread and open/archived status, labels, and `needs_reply`, which is `true` when the latest message is from the contact.

## API

| Request | What it does |
| --- | --- |
| `GET /inbox/threads` | List threads, newest first. Filters: `status` (`open`, the default, `archived` or `all`), `unread=true`, `needs_reply=true`, `mailbox`, `label`, `q` (searches subject, contact and snippet), `limit` |
| `GET /inbox/threads/:id` | A thread with its messages (up to 100), as text |
| `POST /inbox/threads/:id/reply` | Reply with `{ "text": "..." }` or `{ "html": "..." }`. Optional `from`; defaults to the mailbox address |
| `PATCH /inbox/threads/:id` | Change `status` (`open` or `archived`), `unread` (boolean) or `labels` (names; new labels are created) |
| `GET /inbox/labels` | List labels |

```bash
# Threads waiting for an answer
curl "https://delivrie.io/api/inbox/threads?needs_reply=true" -H "Authorization: Bearer $DELIVRIE_API_KEY"

# Reply, then archive
curl -X POST https://delivrie.io/api/inbox/threads/THREAD_ID/reply \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "text": "Thanks Ada, your refund is on its way." }'

curl -X PATCH https://delivrie.io/api/inbox/threads/THREAD_ID \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "status": "archived", "labels": ["refunds"] }'
```

Plain-text replies are wrapped in simple HTML for you. The reply's subject gets `Re:` and the right threading headers, so it stays in the same conversation in the customer's mail app.

## Let an AI agent handle support

Connect an assistant to the [MCP server](/docs/mcp) and it can work the inbox with the `list_inbox_threads`, `get_inbox_thread`, `reply_to_thread` and `update_thread` tools. For example, in Claude:

```text
Check my Delivrie inbox for threads that need a reply. For each one, read it,
draft an answer using our refund policy (below), and show me the drafts before
sending. Archive and label "done" any thread you answer.
```

Approve the `read` and `send` scopes, and leave out `manage`, if the agent should read and reply but not change your account.
