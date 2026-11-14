---
title: API keys
group: Get started
order: 5
description: Create, scope, store and rotate Delivrie API keys: full access vs sending access, domain-restricted keys, and what to do if a key leaks.
---
Every API request needs a key in the `Authorization` header:

```http
Authorization: Bearer dlv_your_key
```

## Create a key

In the dashboard, open [API keys](https://delivrie.io/api-keys) and click **Create API key**, or call [`POST /api-keys`](/docs/api/create-api-key) with a full access key:

```bash
curl -X POST https://delivrie.io/api/api-keys \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Production web app", "permission": "sending_access" }'
```

The response contains the key in `token`. It's shown once: Delivrie stores only a hash, so copy it straight into your secret store.

## Permissions

| Permission | Can do | Use for |
| --- | --- | --- |
| `full_access` | Every endpoint: domains, contacts, webhooks, keys, logs and sending | Scripts, back-office tools, CI |
| `sending_access` | Only sending: `POST /emails`, `POST /emails/batch`, rescheduling, canceling and forwarding emails, `POST /events` and inbox replies | Production apps |

Add `domain_id` to a sending key to limit it to one domain. Sending from any other domain then fails with `403 restricted_api_key`. Calling an endpoint a sending key can't use also returns `403 restricted_api_key`.

## Store keys safely

- Keep keys in environment variables or your platform's secret store (Vercel, Netlify, Fly, Supabase, Cloudflare and GitHub Actions all have one). Name it `DELIVRIE_API_KEY`; the Node.js SDK reads it automatically.
- Never put a key in browser or mobile app code, a public repo, or a URL.
- Use a separate key per app and environment, so you can revoke one without breaking the others.

## Rotate or revoke

Create the new key, deploy it, then delete the old one in [API keys](https://delivrie.io/api-keys) (or with `DELETE /api-keys/:id`). Deletion takes effect immediately; requests with the old key get `401 invalid_api_key`.

> **Warning:** If a key leaks, delete it straight away, then check [Logs](https://delivrie.io/logs) for requests you don't recognise. Every API request is logged, along with the key that made it.

## Keys for AI assistants

You don't need to give an assistant your API key. Connect it to the [MCP server](/docs/mcp) instead: you approve the team and scopes in your browser, and can revoke access under Settings → Connected apps.
