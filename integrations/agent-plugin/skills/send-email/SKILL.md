---
name: send-email
description: Add transactional email (sign-up, receipts, password resets, notifications) to an app with Delivrie, in any language. Use when the user wants their code to send email.
---
# Send email with Delivrie

Docs for any page as Markdown: append `.md` to its URL, e.g. https://delivrie.io/docs/send-email.md. Everything in one file: https://delivrie.io/llms-full.txt.

## 1. Pick the client for the project's language

| Language | Install | Client |
| --- | --- | --- |
| Node.js / TypeScript / Bun / Deno / edge | `npm install delivrie` | `new Delivrie(process.env.DELIVRIE_API_KEY)`; calls return `{ data, error }` and don't throw for API errors |
| Python | `pip install delivrie` | `Delivrie()` (reads `DELIVRIE_API_KEY`) |
| Go | `go get github.com/bysurce/delivrie/sdk/go` | `delivrie.NewClient(os.Getenv("DELIVRIE_API_KEY"))` |
| PHP | `composer require delivrie/delivrie-php` | `new \Delivrie\Delivrie(getenv('DELIVRIE_API_KEY'))` |
| Ruby | `gem install delivrie` | `Delivrie::Client.new(ENV["DELIVRIE_API_KEY"])`, `emails.send_email(...)` |
| Java / Kotlin | `io.delivrie:delivrie-java` | `new Delivrie(System.getenv("DELIVRIE_API_KEY"))` |
| C# / .NET | `dotnet add package Delivrie` | `new DelivrieClient(...)`, `await Emails.SendAsync(...)` |
| Rust | `cargo add delivrie` | `delivrie::Client::new(key)` |
| Anything else | HTTP | `POST https://delivrie.io/api/emails` with `Authorization: Bearer $DELIVRIE_API_KEY` |

Framework mailers (Rails Action Mailer, Laravel, Django, Spring, Nodemailer, WordPress) can use the SMTP relay instead: `smtp.delivrie.io`, port 587, user `delivrie`, password = the API key.

## 2. Rules to follow

- Read the key from the `DELIVRIE_API_KEY` environment variable. Never hard-code it, never commit it, and never call Delivrie from browser code: send from a server route, server action, job or edge function. Add the variable to `.env.example` without a value.
- `from` must be on a domain verified in the user's Delivrie account, written `"Name <address@domain>"`. If you have the Delivrie MCP tools, call `list_domains` to find a verified one; otherwise ask the user.
- Pass an idempotency key derived from the business event (`order-${order.id}-receipt`, `welcome-${user.id}`) so a retry never sends twice.
- Send after the database write that triggers the email succeeds, and don't fail the user's request if the email fails: log the error (it has `name` and `message`) and move on, or enqueue a retry.
- For repeated emails, prefer a published template: `{ from, to, template: { id: "welcome", variables: { first_name } } }`.
- In tests and local development, send to `delivered@test.delivrie.io`, `bounced@test.delivrie.io` or `complained@test.delivrie.io`; they never reach a real inbox.

## 3. Check it

If the Delivrie MCP tools are available, send a test with `send_email` to `delivered@test.delivrie.io`, then `get_email` to confirm it was delivered. Otherwise tell the user how to run it and where to see it: https://delivrie.io/emails.

## Errors to expect

`validation_error` (a field is wrong: the message says which), `invalid_from_address` / domain not verified, `invalid_api_key`, `rate_limit_exceeded` (retry with backoff), `daily_quota_exceeded`. Full list: https://delivrie.io/docs/errors.md
