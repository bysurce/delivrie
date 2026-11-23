# Audit logs

See who changed what in your Delivrie team and when: sign-ins, members, API keys, domains, webhooks, single sign-on, connected apps, billing and content. Enterprise plan.

The audit log records who changed what in your team, and when. It's part of the **Enterprise** plan. Delivrie records activity for every team, so the full history is there as soon as you upgrade.

Team admins open it from **Settings → Audit log**. Entries can't be edited or deleted, by you or by us through the dashboard, and you can export them as CSV for security reviews.

## What's recorded

| Area | Examples |
| --- | --- |
| Sign-ins | Every sign-in to the dashboard, with the method (password, code, Google, GitHub, SSO) |
| Members and access | Members added or removed, role changes, invites sent or revoked, single sign-on changes, apps connected or disconnected |
| API keys | Keys created, renamed or deleted (never the key itself) |
| Domains | Domains added or removed, settings changed, DNS checks, Cloudflare setup |
| Webhooks | Endpoints added, changed or deleted, test events |
| Billing | Plan changes, cancellations, spending cap, auto top-up and billing details |
| Content and sending | Templates published or deleted, broadcasts sent or scheduled, automations published or paused, suppressions removed, contacts deleted |

Each entry shows **who** did it (a person, an API key, a connected app, or the system for changes confirmed by the payment provider), **what** changed, the **target** (for example the domain name), and the IP address when the change came through the API.

Sending email isn't a change to your account, so individual sends aren't in the audit log; they're in [Logs](https://delivrie.io/logs) and on each email's page. Only the names of the fields that changed are recorded, never secrets or message content.

## With the API

`GET /audit-logs` returns the newest entries first.

```bash
curl "https://delivrie.io/api/audit-logs?limit=50&action=api_key." \
  -H "Authorization: Bearer $DELIVRIE_API_KEY"
```

| Query | Description |
| --- | --- |
| `limit` | 1 to 200, default 50 |
| `before` | An entry `id`: returns older entries (for paging) |
| `action` | Only actions starting with this, e.g. `domain.` or `billing.plan_changed` |
| `actor` | Only entries by this user id or API key id |

```json
{
  "object": "list",
  "has_more": true,
  "data": [
    {
      "object": "audit_log",
      "id": "1842",
      "created_at": "2026-11-23T14:02:11.000Z",
      "actor_type": "user",
      "actor_label": "ada@acme.com",
      "action": "api_key.created",
      "target_type": "api_key",
      "target_label": "Production",
      "metadata": { "permission": "sending", "prefix": "dlv_7Hk2" },
      "ip": "102.89.34.10",
      "user_agent": "Dashboard"
    }
  ]
}
```

Teams on other plans get `403 plan_required`. The endpoint needs a full-access API key.
