# n8n-nodes-delivrie

Delivrie nodes for [n8n](https://n8n.io):

- **Delivrie**: send emails and templates, create, update and unsubscribe contacts, add or remove segment members, send events that start automations, send broadcasts, and read and reply to Inbox threads.
- **Delivrie Trigger**: starts a workflow on Delivrie events (deliveries, bounces, opens, clicks, received mail, contacts, broadcasts and the Inbox). It creates the Delivrie webhook when you activate the workflow, deletes it when you deactivate it, and checks every request's signature.

Install in n8n: **Settings → Community nodes → Install** → `n8n-nodes-delivrie`. Then add **Delivrie API** credentials with an API key from https://delivrie.io/api-keys.

Build: `npm install && npm run build`. Guide: https://delivrie.io/docs/n8n
