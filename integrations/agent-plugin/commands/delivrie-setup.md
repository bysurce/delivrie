---
name: delivrie-setup
description: Set up Delivrie in this project and send a test email
---
Set up Delivrie email in this project using the send-email skill:
1. Detect the language and framework, and install the right Delivrie SDK (or plan an SMTP setup for framework mailers).
2. Add DELIVRIE_API_KEY to the env example file and show where to put the real key.
3. If the Delivrie MCP tools are connected, list verified domains and pick a sender; otherwise ask me for one.
4. Add a small server-side helper that sends email with an idempotency key, and one example call where it fits.
5. Send a test to delivered@test.delivrie.io (with the MCP tools if available) and confirm it was delivered.
