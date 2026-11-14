---
title: Automations and events
group: Platform
order: 9
description: Send emails automatically when something happens: record events with POST /events, build automations with waits, conditions and branches, and create simple flows with the API.
---
Automations send emails on their own when something happens: a welcome series after sign-up, a nudge three days after a trial starts, a receipt when an order is paid. Your app sends an **event**; any live automation listening for it starts a **run** for that contact.

## 1. Send events from your app

```bash cURL
curl -X POST https://delivrie.io/api/events \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "event": "user.signed_up", "email": "ada@example.com", "data": { "plan": "free", "first_name": "Ada" } }'
```

```ts Node.js
await delivrie.events.send({ event: "user.signed_up", email: "ada@example.com", data: { plan: "free", first_name: "Ada" } });
```

```python Python
requests.post("https://delivrie.io/api/events", headers=auth, json={
    "event": "user.signed_up", "email": "ada@example.com", "data": {"plan": "free"},
})
```

| Field | Notes |
| --- | --- |
| `event` | Lowercase letters, numbers, dots, dashes and underscores, like `order.paid` |
| `email` | The contact it's about. The contact is created if it doesn't exist |
| `data` | Optional JSON, up to 32 KB. Use it in conditions and templates |

The response says how many automations started: `{ "object": "event", "id": "...", "event": "user.signed_up", "runs": 1 }`. Sending access keys can send events. See recent events in [Events](https://delivrie.io/events), or with `GET /events` (event names) and `GET /events?name=user.signed_up` (recent events with that name).

## 2. Build an automation

In [Automations](https://delivrie.io/automations), create one and pick a trigger:

- **An event**, like `user.signed_up`
- **A contact joining a segment**

Then add steps:

| Step | Does |
| --- | --- |
| Send email | Sends a published [template](/docs/templates) |
| Wait | Pauses for minutes, hours, days or weeks |
| Condition | Branches on event data or contact properties |

Choose whether a contact can go through it once or every time the trigger happens, then **Publish**. Use **Test** to run it for one address without affecting stats.

## Create one with the API

The API creates straight-line automations (send and wait steps). Build branches in the dashboard.

```bash
curl -X POST https://delivrie.io/api/automations \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Welcome series",
    "trigger": { "event": "user.signed_up" },
    "steps": [
      { "type": "send", "template_id": "welcome" },
      { "type": "wait", "amount": 2, "unit": "days" },
      { "type": "send", "template_id": "getting-started-tips" }
    ],
    "reentry": "once",
    "publish": true
  }'
```

`template_id` takes a template id or alias, and a send step can override `from` and `subject`. Up to 30 steps. Use `{ "segment_id": "..." }` as the trigger to start when someone joins a segment.

Manage automations with `GET /automations`, `GET /automations/:id` (with run counts), `GET /automations/:id/runs`, and `POST /automations/:id/publish`, `/pause` and `/resume`.

## Runs

Each contact going through an automation is a run: `running`, `completed`, `failed` or `canceled`. Open an automation to see every run and each step's timing. If a step fails (for example, the template's sender domain isn't verified), fix the cause, then retry or skip the step from the run.

## Event data in templates

Templates sent by an automation can use the contact's details and the triggering event's data. For the event above, `{{first_name}}` and `{{plan}}` both work, and so does the longer form `{{data.plan}}`, including nested fields like `{{data.order.total}}`. Add a fallback with `{{plan|free}}`. In automations, every variable is HTML-escaped.
