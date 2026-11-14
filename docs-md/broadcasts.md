# Broadcasts

Send newsletters and announcements to a segment of contacts with Delivrie broadcasts: personalisation, topics, unsubscribe links, test sends and scheduling, from the dashboard or the API.

A broadcast sends one email to every subscribed contact in a [segment](/docs/contacts): newsletters, product announcements, policy updates. Each recipient gets their own copy with their name filled in and their own unsubscribe link.

## From the dashboard

1. Open [Broadcasts](https://delivrie.io/broadcasts) and click **New broadcast**.
2. Choose a verified sender, a segment and, optionally, a [topic](/docs/contacts) so people can opt out of just this kind of email.
3. Write it in the editor. Use `{{first_name}}` or any contact property.
4. **Send test** to up to five inboxes and check it on your phone.
5. **Send now** or **Schedule**.

## With the API

```bash
# 1. Create a draft
curl -X POST https://delivrie.io/api/broadcasts \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "November newsletter",
    "from": "Acme <news@mail.acme.com>",
    "subject": "What we shipped in November",
    "segment_id": "SEGMENT_ID",
    "preview_text": "Three new features and a discount",
    "html": "<p>Hi {{first_name|there}},</p><p>...</p><p><a href=\"{{{unsubscribe_url}}}\">Unsubscribe</a></p>"
  }'

# 2. Send it now, or schedule it with an ISO 8601 time
curl -X POST https://delivrie.io/api/broadcasts/BROADCAST_ID/send \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "scheduled_at": "2026-11-20T08:00:00Z" }'
```

The send response includes `recipients`, the number of contacts it will go to. Cancel a scheduled broadcast with `POST /broadcasts/:id/cancel` (it goes back to draft), and check how many contacts it will reach with `GET /broadcasts/:id/recipients`.

## Who receives it

Every contact in the segment, except contacts who:

- are unsubscribed,
- are on your [suppression list](/docs/suppressions), or
- opted out of the broadcast's topic.

## Personalisation

| Variable | Inserts |
| --- | --- |
| `{{first_name}}`, `{{last_name}}`, `{{email}}` | The contact's details (escaped). `first_name` falls back to "there" when empty |
| `{{plan}}`, `{{city}}`, ... | Any [contact property](/docs/contacts), with the fallback you set for that property |
| `{{first_name\|friend}}` | A fallback just for this email |
| `{{{unsubscribe_url}}}` | The recipient's unsubscribe page |

## Unsubscribing

Every broadcast email gets `List-Unsubscribe` and one-click unsubscribe headers, so Gmail and Apple Mail show their own **Unsubscribe** button. Include a visible link too, with `{{{unsubscribe_url}}}`. The page it opens lets people unsubscribe from everything or from one topic, and you can brand it in Settings.

## Broadcasts vs. API sends

Use broadcasts for the same message to many people. For one-to-one messages triggered by something a user did (receipts, password resets, alerts), use [`POST /emails`](/docs/send-email) or an [automation](/docs/automations).
