# Delivrie for Rust

The official Rust client for [Delivrie](https://delivrie.io): transactional email, broadcasts, templates, contacts, automations, the Inbox and AI writing. Async, built on `reqwest` with rustls.

```bash
cargo add delivrie serde_json
cargo add tokio --features macros,rt-multi-thread
```

```rust
use serde_json::json;

#[tokio::main]
async fn main() -> delivrie::Result<()> {
    let delivrie = delivrie::Client::new(std::env::var("DELIVRIE_API_KEY").unwrap());
    let email = delivrie.emails().send(&json!({
        "from": "Acme <orders@mail.acme.com>",
        "to": "ada@example.com",
        "subject": "Your order is confirmed",
        "html": "<p>Thanks for your order!</p>",
    })).await?;
    println!("{}", email["id"]);
    Ok(())
}
```

Methods take anything that implements `serde::Serialize` (`json!` values or your own structs) and return the API's JSON as a `serde_json::Value`. Failed requests return `delivrie::Error`, with `status()`, `name()` and a message. `Client` is cheap to clone and safe to share between tasks.

## More examples

```rust
// A published template, safe to retry
delivrie.emails().send_idempotent(&json!({ "from": "Acme <hi@acme.com>", "to": "ada@example.com",
    "template": { "id": "welcome", "variables": { "first_name": "Ada" } } }), "signup-42").await?;

// Attach a public URL: Delivrie downloads it
delivrie.emails().send(&json!({ "from": "...", "to": "...", "subject": "Invoice", "text": "Attached.",
    "attachments": [{ "path": "https://acme.com/invoice.pdf" }] })).await?;

// The Inbox
let threads = delivrie.inbox().threads(&[("needs_reply", "true")]).await?;

// AI writing in your brand voice, straight into a template
delivrie.ai().draft(&json!({ "url": "https://acme.com/blog/launch", "target": { "type": "template", "id": "launch-email" } })).await?;

// Anything else
delivrie.request("GET", "/emails", None::<&serde_json::Value>, &[("limit", "5")], None).await?;
```

## Webhooks

```rust
let event = delivrie::webhook::verify(&body, headers.iter().map(|(k, v)| (k.as_str(), v.to_str().unwrap_or(""))), &secret)?;
```

## Options

```rust
let delivrie = delivrie::Client::builder()
    .api_key(key)
    .timeout(std::time::Duration::from_secs(30))
    .max_retries(2)
    .build()?;
```

Rate limits (429), server errors and network errors are retried with backoff for GET and DELETE, and for sends only with an idempotency key (`send_idempotent`), so a retry never sends twice.

Docs: [delivrie.io/docs/rust](https://delivrie.io/docs/rust) · API reference: [delivrie.io/docs/api](https://delivrie.io/docs/api)
