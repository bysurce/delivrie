# Make

Use Delivrie in Make scenarios: send emails and templates, create contacts, add them to segments, start automations, call any API endpoint, and watch Delivrie events instantly.

## Connect

Add a **Delivrie** module to a scenario and create a connection with an API key from [API keys](https://delivrie.io/api-keys).

## Modules

| Module | Type | What it does |
| --- | --- | --- |
| Watch Events | Instant trigger | Runs the scenario on the Delivrie events you choose: deliveries, bounces, spam complaints, opens, clicks, received mail, contacts, broadcasts and Inbox messages |
| Send an Email | Action | Sends an email or a published [template](/docs/templates), with attachments by URL and an idempotency key |
| Create or Update a Contact | Action | Adds a contact or updates the one with that email, with properties and a segment |
| Add Contacts to a Segment | Action | Adds contacts, creating any that don't exist |
| Send an Event | Action | Records an [event](/docs/automations) that starts automations |
| Make an API Call | Universal | Calls any endpoint in the [API reference](/docs/api) with your connection |

Watch Events creates a Delivrie [webhook](/docs/webhooks) for the scenario and deletes it when you remove the trigger.

## Without the app

Every Delivrie endpoint also works from Make's **HTTP → Make a request** module: `https://delivrie.io/api/emails`, method `POST`, header `Authorization: Bearer <your API key>`, body type JSON.

The app's source is in [integrations/make](https://github.com/bysurce/delivrie/tree/main/integrations/make).
