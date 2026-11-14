---
title: Rust
group: SDKs and frameworks
order: 8
description: Send email from Rust with Delivrie using reqwest and serde, handle API errors, send attachments and verify webhooks.
---
There's no Rust crate yet. The API is plain JSON over HTTPS, so `reqwest` and `serde` cover it.

```toml Cargo.toml
[dependencies]
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## Send an email

```rust src/main.rs
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct Email<'a> {
    from: &'a str,
    to: Vec<&'a str>,
    subject: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    html: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<&'a str>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ApiError {
    status_code: u16,
    name: String,
    message: String,
}

#[derive(Deserialize)]
struct Sent {
    id: String,
}

async fn send(client: &reqwest::Client, email: &Email<'_>, idempotency_key: &str) -> Result<String, ApiError> {
    let key = std::env::var("DELIVRIE_API_KEY").expect("set DELIVRIE_API_KEY");
    let res = client
        .post("https://delivrie.io/api/emails")
        .bearer_auth(key)
        .header("Idempotency-Key", idempotency_key)
        .json(email)
        .send()
        .await
        .map_err(|e| ApiError { status_code: 0, name: "network_error".into(), message: e.to_string() })?;

    if res.status().is_success() {
        let sent: Sent = res.json().await.map_err(|e| ApiError { status_code: 0, name: "decode_error".into(), message: e.to_string() })?;
        Ok(sent.id)
    } else {
        Err(res.json::<ApiError>().await.unwrap_or(ApiError {
            status_code: 0,
            name: "application_error".into(),
            message: "unreadable error body".into(),
        }))
    }
}

#[tokio::main]
async fn main() {
    let client = reqwest::Client::new();
    let email = Email {
        from: "Acme <hello@mail.acme.com>",
        to: vec!["ada@example.com"],
        subject: "Welcome",
        html: Some("<p>Welcome to Acme</p>"),
        text: None,
    };
    match send(&client, &email, "welcome-42").await {
        Ok(id) => println!("sent {id}"),
        Err(e) => eprintln!("{} {}: {}", e.status_code, e.name, e.message),
    }
}
```

Reuse one `reqwest::Client` for the whole app; it keeps connections open between requests.

## Attachments

Add the `base64` crate and send the file as base64 `content`:

```rust
use base64::{engine::general_purpose::STANDARD, Engine};

let pdf = std::fs::read("invoice.pdf")?;
let body = serde_json::json!({
    "from": "Billing <billing@mail.acme.com>",
    "to": ["ada@example.com"],
    "subject": "Your invoice",
    "text": "Attached.",
    "attachments": [{ "filename": "invoice.pdf", "content": STANDARD.encode(pdf) }]
});
```

## Verify webhooks

```toml Cargo.toml
hmac = "0.12"
sha2 = "0.10"
base64 = "0.22"
```

```rust src/webhook.rs
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;

pub fn verify(payload: &[u8], id: &str, timestamp: &str, signatures: &str, secret: &str) -> bool {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
    match timestamp.parse::<i64>() {
        Ok(ts) if (now - ts).abs() <= 300 => {}
        _ => return false,
    }
    let Ok(key) = STANDARD.decode(secret.trim_start_matches("whsec_")) else { return false };
    signatures.split(' ').any(|sig| {
        let Some(("v1", value)) = sig.split_once(',') else { return false };
        let Ok(given) = STANDARD.decode(value) else { return false };
        let mut mac = Hmac::<Sha256>::new_from_slice(&key).unwrap();
        mac.update(format!("{id}.{timestamp}.").as_bytes());
        mac.update(payload);
        mac.verify_slice(&given).is_ok() // constant-time comparison
    })
}
```

Pass the raw body bytes and the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers. In Axum, take the body as `Bytes` and read headers from `HeaderMap`.
