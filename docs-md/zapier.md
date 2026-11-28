# Zapier

Connect Delivrie to 7,000+ apps with Zapier: send emails and templates, sync contacts and segments, start automations, and trigger Zaps from deliveries, bounces, received mail, the Inbox and broadcasts.

## Connect

Add the **Delivrie** app in Zapier and paste an API key from [API keys](https://delivrie.io/api-keys). A full access key works with everything; a sending key is enough for **Send Email**.

## Triggers

Triggers are instant: when a Zap turns on, Delivrie creates a [webhook](/docs/webhooks) for it, and deletes it when the Zap turns off.

| Trigger | When it fires |
| --- | --- |
| Email Event | An email is delivered, bounces, is opened or clicked, is marked as spam, fails or is delayed (choose which) |
| New Received Email | Mail arrives at one of your [receiving](/docs/receiving) addresses |
| Contact Created or Updated | A contact is added, changes, unsubscribes or is deleted |
| New Inbox Message | A customer writes to one of your [inboxes](/docs/inbox) |
| Broadcast Sent | A broadcast finishes sending, with its stats |

## Actions

| Action | What it does |
| --- | --- |
| Send Email | Sends an email you write in the Zap, or a published [template](/docs/templates) with variables. Optional attachment URL, schedule and idempotency key |
| Create or Update Contact | Adds a contact or updates the one with that email, with properties, and optionally adds it to a segment |
| Add Contacts to Segment | Adds contacts to a segment, creating any that don't exist |
| Send Event | Records an [event](/docs/automations) that starts automations |
| Unsubscribe Contact | Unsubscribes a contact from broadcasts |
| Find Contact (search) | Looks a contact up by email |

## Ideas

- **New Stripe customer → Create or Update Contact** with their plan as a property, then **Send Event** `customer.created` to start an onboarding automation.
- **Email Event (bounced) → Update row in Google Sheets or HubSpot** to flag the address.
- **New Typeform entry → Send Email** using a published `form-receipt` template.
- **New Inbox Message → Slack** so the team sees new conversations.

The app's source is in [integrations/zapier](https://github.com/bysurce/delivrie/tree/main/integrations/zapier).
