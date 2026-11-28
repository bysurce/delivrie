---
title: n8n
group: Integrations
order: 3
description: Use Delivrie in n8n workflows with the n8n-nodes-delivrie community package: send emails and templates, manage contacts and segments, start automations, reply in the Inbox, and trigger workflows on Delivrie events.
---
## Install

In n8n, open **Settings → Community nodes → Install**, enter `n8n-nodes-delivrie` and confirm. Then create **Delivrie API** credentials with a key from [API keys](https://delivrie.io/api-keys).

On a self-hosted n8n you can also install it with `npm install n8n-nodes-delivrie` in your n8n custom folder.

## Delivrie node

| Resource | Operations |
| --- | --- |
| Email | Send, Send Template, Get, Get Many |
| Contact | Create or Update, Get, Unsubscribe, Delete |
| Segment | Add Contacts, Remove Contacts, Get Many |
| Event | Send (starts [automations](/docs/automations)) |
| Broadcast | Send or schedule, Get |
| Inbox | Get Threads (with [search](/docs/inbox)), Reply, Create Draft |

Send Email takes an optional attachment URL and idempotency key. For anything else, use n8n's **HTTP Request** node with the same **Delivrie API** credentials and any endpoint from the [API reference](/docs/api).

## Delivrie Trigger

Choose the events to listen for (deliveries, bounces, opens, clicks, received mail, contacts, broadcasts, Inbox messages and agent runs). Activating the workflow creates a Delivrie [webhook](/docs/webhooks) for it; deactivating it deletes the webhook. Every request's signature is checked with the webhook's secret, and requests that don't match are rejected.

## Ideas

- **Inbox message → AI agent → Create Draft**, so a person reviews each reply before it goes out.
- **Email bounced → Postgres**: mark the address as invalid in your own database.
- **Schedule → Get Many contacts from your CRM → Create or Update Contact** to keep segments in sync.

The package's source is in [integrations/n8n](https://github.com/bysurce/delivrie/tree/main/integrations/n8n).
