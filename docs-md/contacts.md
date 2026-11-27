# Contacts, segments and topics

Store your audience in Delivrie: create and import contacts, custom properties, segments for broadcasts and automations, and topics for granular unsubscribes.

Contacts are the people you send broadcasts and automations to. They belong to your team, and each email address appears once.

## Create or update a contact

`POST /contacts` creates a contact, or updates it if the email already exists, so it's safe to call on every sign-up. For an existing contact, only the fields you send change: names and `unsubscribed` are replaced, `properties` are merged, and anything you leave out is kept. Someone who unsubscribed stays unsubscribed unless you send `"unsubscribed": false`:

```bash
curl -X POST https://delivrie.io/api/contacts \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "email": "ada@example.com",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "properties": { "plan": "pro", "city": "London" },
    "segments": ["SEGMENT_ID"]
  }'
```

```ts Node.js
await delivrie.contacts.create({ email: "ada@example.com", first_name: "Ada", properties: { plan: "pro" } });
```

Get, update or delete a contact by id **or** email address:

```bash
curl https://delivrie.io/api/contacts/ada@example.com -H "Authorization: Bearer $DELIVRIE_API_KEY"

curl -X PATCH https://delivrie.io/api/contacts/ada@example.com \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "properties": { "plan": "scale" }, "unsubscribed": false }'
```

`properties` in an update are merged into the existing ones; other properties are kept.

## Import

Upload a CSV in [Contacts → Import](https://delivrie.io/contacts/import). Map columns to email, first name, last name and properties, and choose a segment to add everyone to. Only import people who agreed to hear from you.

With the API, `POST /contacts/imports` takes CSV text (with an `email` column) or a list of contacts, up to 50,000 at a time. It runs in the background:

```bash
curl -X POST https://delivrie.io/api/contacts/imports \
  -H "Authorization: Bearer $DELIVRIE_API_KEY" -H "Content-Type: application/json" \
  -d '{ "csv": "email,first_name,plan\nada@example.com,Ada,pro\nsam@example.com,Sam,free", "segment_ids": ["SEGMENT_ID"] }'
```

Columns other than `email`, `first_name`, `last_name` and `unsubscribed` become properties (`plan` above). Rename or skip columns with `columns`, like `{ "E-mail": "email", "Company": "property:company", "Notes": null }`. Set `update_existing: false` to leave contacts that already exist as they are. Check progress with `GET /contacts/imports/:id` (it reports `created`, `updated`, `skipped` and the first 100 errors), list recent imports with `GET /contacts/imports`, or listen for the `contact.import.completed` [webhook](/docs/webhooks).

## Properties

Properties hold anything you want to personalise or filter by: plan, city, signup date. Define them, with a type and fallback value, in [Contacts → Properties](https://delivrie.io/contacts/properties). `GET /contact-properties` lists them. Use them in broadcasts as `{{plan}}`.

## Segments

Segments are named groups of contacts. Broadcasts go to a segment, and automations can start when someone joins one.

| Request | What it does |
| --- | --- |
| `POST /segments` with `{ "name": "Beta users" }` | Create a segment |
| `GET /segments` | List segments |
| `GET /segments/:id` | One segment with its contact count |
| `PATCH /segments/:id` with `{ "name": "Customers" }` | Rename a segment |
| `GET /segments/:id/contacts` | List the contacts in a segment (`limit`, `offset`) |
| `POST /segments/:id/contacts` with `{ "contacts": ["ada@example.com", { "email": "sam@example.com", "first_name": "Sam" }] }` | Add contacts, creating any that don't exist |
| `DELETE /segments/:id/contacts` with `{ "contacts": ["ada@example.com"] }` | Take contacts out of the segment (emails or ids). `DELETE /segments/:id/contacts/:email` removes one |
| `DELETE /segments/:id` | Delete the segment (the contacts stay) |

## Topics

Topics let people opt out of one kind of email (say, product updates) without leaving everything. Create them in [Contacts → Topics](https://delivrie.io/contacts/topics) with a default of opt-in or opt-out, then pick a topic when you create a broadcast. The unsubscribe page shows each topic as its own switch. `GET /topics` lists them.

## Unsubscribed contacts

A contact with `unsubscribed: true` gets no broadcasts. It happens when they click unsubscribe, when they mark a broadcast as spam, or when you set it. Transactional emails sent with `POST /emails` aren't affected; they're for messages the person needs, like receipts.
