# Rust

Send email from Rust with the official delivrie crate: async requests with reqwest and serde_json, typed errors, idempotent retries and webhook verification.

The `delivrie` crate is the official Rust SDK. It's async, built on `reqwest` with rustls, and takes anything that implements `serde::Serialize`. Source: [github.com/bysurce/delivrie](https://github.com/bysurce/delivrie/tree/main/sdk/rust).

```bash
cargo add delivrie serde_json
cargo add tokio --features macros,rt-multi-thread
```

## Send an email

```rust src/main.rs
use serde_json::json;

#[tokio::main]
async fn main() -> delivrie::Result<()> {
    let delivrie = delivrie::Client::new(std::env::var("DELIVRIE_API_KEY").expect("DELIVRIE_API_KEY"));

    let email = delivrie
        .emails()
        .send(&json!({
            "from": "Acme <hello@mail.acme.com>",
            "to": "ada@example.com",
            "subject": "Welcome",
            "html": "<p>Welcome to Acme</p>",
        }))
        .await?;
    println!("{}", email["id"]);
    Ok(())
}
```

Methods return the API's JSON as a `serde_json::Value`. Pass your own structs instead of `json!` when you prefer types: any `#[derive(Serialize)]` value works. `Client` is cheap to clone and safe to share between tasks.

## Errors, retries and idempotency

```rust
match delivrie.emails().send_idempotent(&email, &format!("welcome-{user_id}")).await {
    Ok(sent) => println!("sent {}", sent["id"]),
    Err(e) => eprintln!("{} {}: {e}", e.status(), e.name()),
}
```

`delivrie::Error` is `Api { status, name, message }`, `Network`, `Timeout` or `Invalid`; `status()` and `name()` work on all of them (see [Errors](/docs/errors)). `GET` and `DELETE` requests are retried twice on rate limits, `5xx` responses and network failures. Sends are retried only through the `_idempotent` methods, so a retry never sends twice.

```rust
let delivrie = delivrie::Client::builder()
    .api_key(key)
    .timeout(std::time::Duration::from_secs(10))
    .max_retries(3)
    .build()?;
```

## Attachments

Send base64 `content`, or a public `https://` URL as `path` for Delivrie to download:

```rust
use base64::{engine::general_purpose::STANDARD, Engine};

let pdf = std::fs::read("invoice-1042.pdf")?;
delivrie.emails().send(&json!({
    "from": "Billing <billing@mail.acme.com>",
    "to": "ada@example.com",
    "subject": "Your invoice",
    "text": "Attached.",
    "attachments": [{ "filename": "invoice-1042.pdf", "content": STANDARD.encode(pdf) }],
})).await?;
```

## Methods

| Resource | Methods |
| --- | --- |
| `emails()` | `send`, `send_batch`, `get`, `list`, `list_received`, `update`, `cancel`, `forward`, `attachments`, `received_attachments`, `share` |
| `domains()` | `create`, `get`, `list`, `verify`, `update`, `delete` |
| `api_keys()` | `create`, `list`, `update`, `delete` |
| `webhooks()` | `create`, `list`, `deliveries`, `test`, `replay` |
| `contacts()` | `create`, `get`, `list`, `update`, `delete`, `import_contacts`, `get_import`, `list_imports` |
| `segments()` | `create`, `get`, `list`, `update`, `delete`, `contacts`, `add_contacts`, `remove_contacts` |
| `broadcasts()` | `create`, `get`, `list`, `update`, `send`, `cancel`, `duplicate`, `recipients`, `links`, `delete`, `get_content`, `edit_content` |
| `templates()` | `create`, `get`, `list`, `update`, `publish`, `duplicate`, `delete`, `get_content`, `edit_content` |
| `suppressions()` | `list`, `add`, `delete` |
| `events()` | `send`, `list` |
| `automations()` | `create`, `get`, `list`, `update`, `delete`, `runs`, `publish`, `pause`, `resume`, `duplicate` |
| `inboxes()` | `list`, `create`, `get`, `update`, `delete`, `agent_runs` |
| `inbox()` | `threads`, `thread`, `update_thread`, `reply`, `run_agent`, `notes`, `add_note`, `delete_note`, `drafts`, `create_draft`, `update_draft`, `send_draft`, `discard_draft`, `labels` |
| `ai()` | `draft`, `rewrite`, `subjects` |
| `logs()` | `list`, `get` |

Methods with a body take `&impl Serialize`; list methods take query pairs like `&[("limit", "10")]`. For anything else, `delivrie.request("GET", "/emails", None::<&serde_json::Value>, &[("limit", "10")], None)` calls the API with the same auth, retries and errors. Every endpoint is in the [API reference](/docs/api).

## Verify webhooks

```rust
// axum
async fn webhook(headers: axum::http::HeaderMap, body: String) -> axum::http::StatusCode {
    let pairs = headers.iter().map(|(k, v)| (k.as_str(), v.to_str().unwrap_or("")));
    match delivrie::webhook::verify(&body, pairs, &std::env::var("DELIVRIE_WEBHOOK_SECRET").unwrap()) {
        Ok(event) => {
            // event["type"], event["data"]
            axum::http::StatusCode::OK
        }
        Err(_) => axum::http::StatusCode::BAD_REQUEST,
    }
}
```

It checks the signature against the raw body and rejects requests older than five minutes. More in [Webhooks](/docs/webhooks).
