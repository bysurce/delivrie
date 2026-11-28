# Delivrie for Zapier

A Zapier Platform CLI app.

- **Triggers** (instant, through Delivrie webhooks): Email Event (delivered, bounced, opened, clicked, marked as spam…), New Received Email, Contact Created or Updated, New Inbox Message, Broadcast Sent.
- **Actions**: Send Email (or a published template, with an attachment URL and idempotency key), Create or Update Contact, Add Contacts to Segment, Send Event, Unsubscribe Contact.
- **Search**: Find Contact.

```bash
npm install
npm test
npx zapier-platform-cli login
npx zapier-platform-cli register "Delivrie"   # once
npx zapier-platform-cli push
```

Guide: https://delivrie.io/docs/zapier
