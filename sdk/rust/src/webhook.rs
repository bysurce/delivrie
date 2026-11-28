//! Verifies webhook requests. Delivrie signs with the Standard Webhooks scheme: `webhook-id`, `webhook-timestamp`
//! and `webhook-signature` headers, the signature being `v1,<base64 HMAC-SHA256 of id.timestamp.body>` keyed with
//! the endpoint's `whsec_` signing secret.
//!
//! ```no_run
//! # fn handle(body: &str, headers: &[(&str, &str)]) {
//! match delivrie::webhook::verify(body, headers.iter().copied(), &std::env::var("DELIVRIE_WEBHOOK_SECRET").unwrap()) {
//!     Ok(event) => println!("{}", event["type"]),
//!     Err(e) => eprintln!("rejected: {e}"),
//! }
//! # }
//! ```

use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use std::fmt;

/// Why a request isn't a genuine, recent Delivrie webhook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebhookError(pub String);

impl fmt::Display for WebhookError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for WebhookError {}

fn fail<T>(m: &str) -> Result<T, WebhookError> {
    Err(WebhookError(m.to_owned()))
}

/// Verifies with a 5-minute tolerance. `headers` yields (name, value) pairs in any letter case.
pub fn verify<K: AsRef<str>, V: AsRef<str>>(
    payload: &str,
    headers: impl IntoIterator<Item = (K, V)>,
    secret: &str,
) -> Result<Value, WebhookError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    verify_at(payload, headers, secret, 300, now)
}

/// Like [`verify`], with your own tolerance (seconds) and current time (Unix seconds).
pub fn verify_at<K: AsRef<str>, V: AsRef<str>>(
    payload: &str,
    headers: impl IntoIterator<Item = (K, V)>,
    secret: &str,
    tolerance: i64,
    now: i64,
) -> Result<Value, WebhookError> {
    if secret.is_empty() {
        return fail("Missing signing secret");
    }
    let (mut id, mut ts, mut sigs) = (None, None, None);
    for (k, v) in headers {
        let v = v.as_ref().to_owned();
        match k.as_ref().to_ascii_lowercase().as_str() {
            "webhook-id" if id.is_none() => id = Some(v),
            "webhook-timestamp" if ts.is_none() => ts = Some(v),
            "webhook-signature" if sigs.is_none() => sigs = Some(v),
            _ => {}
        }
    }
    let (Some(id), Some(ts), Some(sigs)) = (
        id.filter(|s| !s.is_empty()),
        ts.filter(|s| !s.is_empty()),
        sigs.filter(|s| !s.is_empty()),
    ) else {
        return fail("Missing webhook-id, webhook-timestamp or webhook-signature header");
    };
    if !ts.bytes().all(|b| b.is_ascii_digit()) {
        return fail("Invalid webhook-timestamp header");
    }
    let Ok(t) = ts.parse::<i64>() else {
        return fail("Invalid webhook-timestamp header");
    };
    if (now - t).abs() > tolerance {
        return fail("Webhook timestamp is too old or in the future");
    }
    let Ok(key) = STANDARD.decode(secret.strip_prefix("whsec_").unwrap_or(secret)) else {
        return fail("Signing secret isn't valid base64");
    };
    // Several space-separated signatures can arrive during secret rotation; any valid one is enough.
    let ok = sigs.split_whitespace().any(|part| {
        let Some((version, sig)) = part.split_once(',') else {
            return false;
        };
        let Ok(sig) = STANDARD.decode(sig) else {
            return false;
        };
        if version != "v1" {
            return false;
        }
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(&key) else {
            return false;
        };
        mac.update(format!("{id}.{ts}.{payload}").as_bytes());
        mac.verify_slice(&sig).is_ok()
    });
    if !ok {
        return fail("Signature doesn't match");
    }
    match serde_json::from_str::<Value>(payload) {
        Ok(v @ Value::Object(_)) => Ok(v),
        _ => fail("Body is not valid JSON"),
    }
}
