---
name: migrate-from-resend
description: Move a codebase from Resend to Delivrie with the smallest change. Use when the user wants to switch email providers from Resend.
---
# Migrate from Resend

Follow https://delivrie.io/docs/migrate-from-resend.md. In short:

1. Delivrie's API is compatible with Resend's: the quickest switch keeps the `resend` SDK and points it at Delivrie with `RESEND_BASE_URL=https://delivrie.io/api` and a Delivrie API key. Or replace `resend` with the `delivrie` package (same call shapes for `emails.send`, `{ data, error }` results).
2. Verify the sending domain in Delivrie first (https://delivrie.io/domains), and keep `from` addresses unchanged.
3. Webhooks: Delivrie uses Standard Webhooks like Resend (Svix). Swap the secret for the new endpoint's `whsec_` secret.
4. List every environment variable the user must set, and don't change behaviour beyond what the guide says.
