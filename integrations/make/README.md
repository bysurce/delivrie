# Delivrie for Make

The source of Delivrie's Make app: a connection (API key), the **Watch Events** instant trigger, and the **Send an Email**, **Create or Update a Contact**, **Add Contacts to a Segment**, **Send an Event** and **Make an API Call** modules.

The files follow Make's custom app layout (`base`, `connections`, `modules`, `webhooks`, `rpcs`, as `.imljson`). Deploy them with the Make Apps Editor extension for VS Code: create an app called `delivrie` on your Make account, then upload each component from this folder. Watch Events subscribes by creating a Delivrie webhook for the scenario's URL and deletes it when the scenario's hook is removed.

Guide: https://delivrie.io/docs/make
