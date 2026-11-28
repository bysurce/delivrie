"""The API surface the Ruby, Java, .NET and Rust SDKs expose, in one place. tools/gen_sdks.py turns it into each
SDK's resource methods; the client core (auth, retries, errors) and webhook verification are written by hand.

Each method: (name, HTTP method, path, args, doc)
  args: ""      no arguments                 "id"        a path id
        "body"  a JSON body                  "id,body"   a path id and a JSON body
        "query" optional query parameters    "id,query"  a path id and optional query parameters
        "id?body"  a path id and an optional JSON body
  A path's {id} is filled from the id argument (URL-encoded). Methods marked IDEM accept an idempotency key.
"""

IDEM = {"emails.send", "emails.send_batch", "events.send"}

RESOURCES = [
    ("emails", "Emails", "Send, schedule, cancel, forward and look up emails.", [
        ("send", "POST", "/emails", "body", "Send an email. Returns { id }."),
        ("send_batch", "POST", "/emails/batch", "body", "Send up to 100 emails in one request."),
        ("get", "GET", "/emails/{id}", "id", "One email with its delivery events."),
        ("list", "GET", "/emails", "query", "Sent emails, newest first."),
        ("list_received", "GET", "/emails/received", "query", "Received emails, newest first."),
        ("update", "PATCH", "/emails/{id}", "id,body", "Reschedule a scheduled email: { scheduled_at }."),
        ("cancel", "POST", "/emails/{id}/cancel", "id", "Cancel a scheduled email."),
        ("forward", "POST", "/emails/{id}/forward", "id,body", "Forward an email: { to, from, note }. Stored attachments are included."),
        ("attachments", "GET", "/emails/{id}/attachments", "id", "A sent email's files with one-hour download links."),
        ("received_attachments", "GET", "/emails/received/{id}/attachments", "id", "A received email's files with one-hour download links."),
        ("share", "POST", "/emails/{id}/share", "id?body", "A public link to the email and its delivery timeline: { expires_in_hours }."),
    ]),
    ("domains", "Domains", "Sending and receiving domains.", [
        ("create", "POST", "/domains", "body", "Add a domain: { name, region }. Returns its DNS records."),
        ("get", "GET", "/domains/{id}", "id", "A domain with its DNS records and their status."),
        ("list", "GET", "/domains", "", "Every domain on the team."),
        ("verify", "POST", "/domains/{id}/verify", "id", "Check DNS now."),
        ("update", "PATCH", "/domains/{id}", "id,body", "Change tracking, TLS or receiving settings."),
        ("delete", "DELETE", "/domains/{id}", "id", "Remove a domain."),
    ]),
    ("api_keys", "ApiKeys", "API keys.", [
        ("create", "POST", "/api-keys", "body", "Create a key: { name, permission, domain_id }. The token is returned once."),
        ("list", "GET", "/api-keys", "", "API keys (tokens are never returned)."),
        ("update", "PATCH", "/api-keys/{id}", "id,body", "Rename a key: { name }."),
        ("delete", "DELETE", "/api-keys/{id}", "id", "Delete a key. Requests with it fail straight away."),
    ]),
    ("webhooks", "Webhooks", "Webhook endpoints.", [
        ("create", "POST", "/webhooks", "body", "Create an endpoint: { endpoint, events }. Returns its signing_secret once."),
        ("list", "GET", "/webhooks", "", "Webhook endpoints."),
        ("update", "PATCH", "/webhooks/{id}", "id,body", "Change the endpoint, events or status (enabled, disabled)."),
        ("delete", "DELETE", "/webhooks/{id}", "id", "Delete an endpoint."),
        ("deliveries", "GET", "/webhooks/{id}/events", "id", "Recent deliveries with status codes."),
        ("test", "POST", "/webhooks/{id}/test", "id", "Send a test event and return the response."),
        ("replay", "POST", "/webhook-deliveries/{id}/replay", "id", "Send a past delivery again."),
    ]),
    ("contacts", "Contacts", "Contacts and contact imports.", [
        ("create", "POST", "/contacts", "body", "Create or update a contact by email."),
        ("get", "GET", "/contacts/{id}", "id", "A contact by id or email."),
        ("list", "GET", "/contacts", "query", "Contacts, newest first."),
        ("update", "PATCH", "/contacts/{id}", "id,body", "Change a contact's name, properties or subscription."),
        ("delete", "DELETE", "/contacts/{id}", "id", "Delete a contact."),
        ("import_contacts", "POST", "/contacts/imports", "body", "Import up to 50,000 contacts from { csv } or { contacts }. Runs in the background."),
        ("get_import", "GET", "/contacts/imports/{id}", "id", "An import's progress and result."),
        ("list_imports", "GET", "/contacts/imports", "query", "Recent imports."),
    ]),
    ("segments", "Segments", "Segments of contacts.", [
        ("create", "POST", "/segments", "body", "Create a segment: { name }."),
        ("get", "GET", "/segments/{id}", "id", "A segment with its contact count."),
        ("list", "GET", "/segments", "", "Segments."),
        ("update", "PATCH", "/segments/{id}", "id,body", "Rename a segment: { name }."),
        ("delete", "DELETE", "/segments/{id}", "id", "Delete a segment (the contacts stay)."),
        ("contacts", "GET", "/segments/{id}/contacts", "id,query", "The contacts in a segment."),
        ("add_contacts", "POST", "/segments/{id}/contacts", "id,body", "Add contacts: { contacts: [emails or objects] }."),
        ("remove_contacts", "DELETE", "/segments/{id}/contacts", "id,body", "Take contacts out: { contacts: [emails or ids] }."),
    ]),
    ("broadcasts", "Broadcasts", "Broadcasts to a segment.", [
        ("create", "POST", "/broadcasts", "body", "Create a draft."),
        ("get", "GET", "/broadcasts/{id}", "id", "A broadcast with its stats."),
        ("list", "GET", "/broadcasts", "", "Broadcasts."),
        ("update", "PATCH", "/broadcasts/{id}", "id,body", "Edit a draft."),
        ("send", "POST", "/broadcasts/{id}/send", "id?body", "Send now, or schedule with { scheduled_at }."),
        ("cancel", "POST", "/broadcasts/{id}/cancel", "id", "Cancel a scheduled broadcast (it goes back to draft)."),
        ("duplicate", "POST", "/broadcasts/{id}/duplicate", "id?body", "Copy it as a new draft."),
        ("recipients", "GET", "/broadcasts/{id}/recipients", "id,query", "Who it went to (or will reach), with delivery flags."),
        ("links", "GET", "/broadcasts/{id}/links", "id", "Clicked links with total and unique clicks."),
        ("delete", "DELETE", "/broadcasts/{id}", "id", "Delete a broadcast that isn't sending."),
        ("get_content", "GET", "/broadcasts/{id}/content", "id", "A draft's subject and blocks with ids."),
        ("edit_content", "POST", "/broadcasts/{id}/content", "id,body", "Edit a draft block by block: { ops } or { blocks }. Shows up live in the editor."),
    ]),
    ("templates", "Templates", "Email templates.", [
        ("create", "POST", "/templates", "body", "Create a template."),
        ("get", "GET", "/templates/{id}", "id", "A template by id or alias."),
        ("list", "GET", "/templates", "", "Templates."),
        ("update", "PATCH", "/templates/{id}", "id,body", "Change a template. Saved as a draft until published."),
        ("publish", "POST", "/templates/{id}/publish", "id", "Publish the current draft."),
        ("duplicate", "POST", "/templates/{id}/duplicate", "id?body", "Copy it as a new draft."),
        ("delete", "DELETE", "/templates/{id}", "id", "Delete a template."),
        ("get_content", "GET", "/templates/{id}/content", "id", "Its subject and blocks with ids."),
        ("edit_content", "POST", "/templates/{id}/content", "id,body", "Edit it block by block: { ops } or { blocks }. Shows up live in the editor."),
    ]),
    ("suppressions", "Suppressions", "Addresses Delivrie won't send to.", [
        ("list", "GET", "/suppressions", "", "Suppressed addresses."),
        ("add", "POST", "/suppressions", "body", "Suppress addresses: { emails }."),
        ("delete", "DELETE", "/suppressions/{id}", "id", "Allow sending to an address again."),
    ]),
    ("events", "Events", "Events that start automations.", [
        ("send", "POST", "/events", "body", "Record an event: { name, email, data }."),
        ("list", "GET", "/events", "query", "Event names your app has sent, or recent events with { name }."),
    ]),
    ("automations", "Automations", "Automations.", [
        ("create", "POST", "/automations", "body", "Create an automation: a trigger and send/wait steps."),
        ("get", "GET", "/automations/{id}", "id", "An automation with run counts."),
        ("list", "GET", "/automations", "", "Automations."),
        ("update", "PATCH", "/automations/{id}", "id,body", "Rename it or change re-entry: { name, reentry }."),
        ("delete", "DELETE", "/automations/{id}", "id", "Delete an automation."),
        ("runs", "GET", "/automations/{id}/runs", "id,query", "Recent runs with each step's log."),
        ("publish", "POST", "/automations/{id}/publish", "id", "Publish it so it starts running."),
        ("pause", "POST", "/automations/{id}/pause", "id", "Pause it."),
        ("resume", "POST", "/automations/{id}/resume", "id", "Resume it."),
        ("duplicate", "POST", "/automations/{id}/duplicate", "id?body", "Copy it as a new draft."),
    ]),
    ("inboxes", "Inboxes", "Inboxes and their agent settings.", [
        ("list", "GET", "/inboxes", "", "Inboxes with open, unread and needs-reply counts."),
        ("create", "POST", "/inboxes", "body", "Create an inbox: { address, name }."),
        ("get", "GET", "/inboxes/{id}", "id", "An inbox by id or address."),
        ("update", "PATCH", "/inboxes/{id}", "id,body", "Change its name, description or agent."),
        ("delete", "DELETE", "/inboxes/{id}", "id", "Remove an inbox."),
        ("agent_runs", "GET", "/inboxes/{id}/agent-runs", "id,query", "The agent's recent runs."),
    ]),
    ("inbox", "Inbox", "Conversations, drafts and notes in the Inbox.", [
        ("threads", "GET", "/inbox/threads", "query", "Threads, newest first. Filters: inbox, status, unread, needs_reply, assignee, label, q."),
        ("thread", "GET", "/inbox/threads/{id}", "id", "A thread with its messages, notes and drafts."),
        ("update_thread", "PATCH", "/inbox/threads/{id}", "id,body", "Change status, unread, assignee or labels."),
        ("reply", "POST", "/inbox/threads/{id}/reply", "id,body", "Reply: { text } or { html }."),
        ("run_agent", "POST", "/inbox/threads/{id}/agent", "id", "Run the inbox's agent on this thread."),
        ("notes", "GET", "/inbox/threads/{id}/notes", "id", "Internal notes."),
        ("add_note", "POST", "/inbox/threads/{id}/notes", "id,body", "Add a note: { body }."),
        ("delete_note", "DELETE", "/inbox/notes/{id}", "id", "Delete a note."),
        ("drafts", "GET", "/inbox/drafts", "query", "Open drafts."),
        ("create_draft", "POST", "/inbox/drafts", "body", "Save a draft."),
        ("update_draft", "PATCH", "/inbox/drafts/{id}", "id,body", "Edit a draft."),
        ("send_draft", "POST", "/inbox/drafts/{id}/send", "id", "Send a draft."),
        ("discard_draft", "DELETE", "/inbox/drafts/{id}", "id", "Discard a draft."),
        ("labels", "GET", "/inbox/labels", "", "Labels."),
    ]),
    ("ai", "Ai", "AI writing in the brand voice.", [
        ("draft", "POST", "/ai/draft", "body", "Write an email from { url } and/or { brief }; { target } writes it into a template or draft broadcast."),
        ("rewrite", "POST", "/ai/rewrite", "body", "Rewrite { blocks } with an { instruction }."),
        ("subjects", "POST", "/ai/subjects", "body", "Subject line ideas for an email's { text }."),
    ]),
    ("logs", "Logs", "API request logs.", [
        ("list", "GET", "/logs", "query", "Recent API requests."),
        ("get", "GET", "/logs/{id}", "id", "One request with its bodies."),
    ]),
]

# Top-level calls on the client itself.
CLIENT_METHODS = [
    ("usage", "GET", "/usage", "", "Plan, emails sent this month and today, and credits."),
    ("metrics", "GET", "/metrics", "query", "Sent, delivered, opened, clicked, bounced and complained totals: { days, domain_id }."),
]
