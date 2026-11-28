# Auth0 → Delivrie

`custom-email-provider.js` is an Auth0 Action for the **Custom Email Provider** trigger. It sends Auth0's verification, password reset, welcome, MFA and invitation emails through Delivrie, with an idempotency key per notification and Auth0's retry for rate limits and server errors.

Set it up in Auth0 under **Branding → Email Provider → Custom Provider**, paste the file, and add the secrets `DELIVRIE_API_KEY` and (optionally) `DELIVRIE_FROM`. Prefer SMTP? Use `smtp.delivrie.io`, port 587, user `delivrie` and your API key as the password.

Guide: https://delivrie.io/docs/auth0. Test: `node test.mjs`.
