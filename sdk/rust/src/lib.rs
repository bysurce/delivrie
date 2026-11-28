//! The official Rust client for [Delivrie](https://delivrie.io): transactional email, broadcasts, templates,
//! contacts, automations, the Inbox and AI writing.
//!
//! ```no_run
//! use serde_json::json;
//!
//! # async fn run() -> delivrie::Result<()> {
//! let delivrie = delivrie::Client::new(std::env::var("DELIVRIE_API_KEY").unwrap());
//! let email = delivrie.emails().send(&json!({
//!     "from": "Acme <hi@acme.com>",
//!     "to": "ada@example.com",
//!     "subject": "Hello",
//!     "html": "<p>It works</p>",
//! })).await?;
//! println!("{}", email["id"]);
//! # Ok(())
//! # }
//! ```
//!
//! Every method returns the API's JSON as a [`serde_json::Value`] or an [`Error`]. Rate limits, server errors and
//! network errors are retried for safe requests, and for sends only with an idempotency key, so a retry never sends an
//! email twice. [`Client`] is cheap to clone and safe to share between tasks.

mod resources;
pub mod webhook;

pub use resources::*;

use serde::Serialize;
use serde_json::Value;
use std::fmt;
use std::time::Duration;

/// The SDK version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// The default API address.
pub const DEFAULT_BASE_URL: &str = "https://delivrie.io/api";

/// A failed request.
#[derive(Debug, Clone, PartialEq)]
pub enum Error {
    /// The API answered with an error: its HTTP status, Delivrie's error name and the message.
    Api {
        status: u16,
        name: String,
        message: String,
    },
    /// Delivrie couldn't be reached.
    Network(String),
    /// No response within the timeout.
    Timeout,
    /// The client is missing its API key, or a body couldn't be serialised.
    Invalid(String),
}

impl Error {
    /// The HTTP status, or 0 for network errors and timeouts.
    pub fn status(&self) -> u16 {
        match self {
            Error::Api { status, .. } => *status,
            _ => 0,
        }
    }

    /// Delivrie's error name, like `validation_error`, `invalid_api_key` or `rate_limit_exceeded`.
    pub fn name(&self) -> &str {
        match self {
            Error::Api { name, .. } => name,
            Error::Network(_) => "network_error",
            Error::Timeout => "timeout",
            Error::Invalid(_) => "invalid_request",
        }
    }

    fn from_response(status: u16, json: &Value, raw: &str) -> Self {
        let fallback = match status {
            401 => "invalid_api_key",
            404 => "not_found",
            429 => "rate_limit_exceeded",
            _ => "application_error",
        };
        let name = json
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(fallback)
            .to_owned();
        let message = json
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| {
                let body: String = raw.chars().take(300).collect::<String>().trim().to_owned();
                if body.is_empty() {
                    format!("Request failed with status {status}")
                } else {
                    body
                }
            });
        let status = json
            .get("statusCode")
            .and_then(Value::as_u64)
            .map(|s| s as u16)
            .unwrap_or(status);
        Error::Api {
            status,
            name,
            message,
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Api {
                status,
                name,
                message,
            } => write!(f, "{message} ({status} {name})"),
            Error::Network(m) => write!(f, "Couldn't reach Delivrie: {m}"),
            Error::Timeout => write!(f, "No response from Delivrie in time"),
            Error::Invalid(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for Error {}

/// `Result<T, delivrie::Error>`.
pub type Result<T> = std::result::Result<T, Error>;

/// Percent-encodes a path id (everything but unreserved characters).
pub(crate) fn enc(id: &str) -> String {
    let mut out = String::with_capacity(id.len());
    for b in id.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// The Delivrie client.
#[derive(Clone)]
pub struct Client {
    api_key: String,
    base_url: String,
    http: reqwest::Client,
    timeout: Duration,
    max_retries: u32,
    headers: Vec<(String, String)>,
}

impl fmt::Debug for Client {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Client")
            .field("base_url", &self.base_url)
            .finish_non_exhaustive()
    }
}

/// Options for [`Client`].
#[derive(Debug, Default)]
pub struct ClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    headers: Vec<(String, String)>,
    http: Option<reqwest::Client>,
}

impl ClientBuilder {
    /// The API key. Falls back to the `DELIVRIE_API_KEY` environment variable.
    pub fn api_key(mut self, key: impl Into<String>) -> Self {
        self.api_key = Some(key.into());
        self
    }
    /// The API address. Falls back to `DELIVRIE_BASE_URL`, then <https://delivrie.io/api>.
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }
    /// Per-request timeout. Default 30 seconds.
    pub fn timeout(mut self, t: Duration) -> Self {
        self.timeout = Some(t);
        self
    }
    /// Retries for rate limits, server and network errors on safe requests. Default 2.
    pub fn max_retries(mut self, n: u32) -> Self {
        self.max_retries = Some(n);
        self
    }
    /// An extra header sent with every request.
    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }
    /// Your own `reqwest::Client` (for proxies or custom TLS).
    pub fn http_client(mut self, c: reqwest::Client) -> Self {
        self.http = Some(c);
        self
    }

    /// Builds the client. Fails when there's no API key.
    pub fn build(self) -> Result<Client> {
        let api_key = self.api_key.filter(|k| !k.is_empty()).or_else(|| std::env::var("DELIVRIE_API_KEY").ok().filter(|k| !k.is_empty())).ok_or_else(|| {
            Error::Invalid("Missing API key. Pass it to Client::new(key) or set DELIVRIE_API_KEY. Create one at https://delivrie.io/api-keys".into())
        })?;
        let base_url = self
            .base_url
            .or_else(|| std::env::var("DELIVRIE_BASE_URL").ok())
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_owned());
        Ok(Client {
            api_key,
            base_url: base_url.trim_end_matches('/').to_owned(),
            http: self.http.unwrap_or_default(),
            timeout: self.timeout.unwrap_or(Duration::from_secs(30)),
            max_retries: self.max_retries.unwrap_or(2),
            headers: self.headers,
        })
    }
}

impl Client {
    /// A client with this API key and default options. Panics if the key is empty; use [`Client::builder`] to handle that.
    pub fn new(api_key: impl Into<String>) -> Self {
        Self::builder()
            .api_key(api_key)
            .build()
            .expect("Delivrie API key")
    }

    /// Options: base URL, timeout, retries, headers and your own `reqwest::Client`.
    pub fn builder() -> ClientBuilder {
        ClientBuilder::default()
    }

    /// The base URL in use.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Plan, emails sent this month and today, and credits.
    pub async fn usage(&self) -> Result<Value> {
        self.request("GET", "/usage", None::<&Value>, &[], None)
            .await
    }

    /// Sent, delivered, opened, clicked, bounced and complained totals, e.g. `&[("days", "30")]`.
    pub async fn metrics(&self, query: &[(&str, &str)]) -> Result<Value> {
        self.request("GET", "/metrics", None::<&Value>, query, None)
            .await
    }

    /// Calls any API path (relative to the base URL, like `/emails`) and returns the decoded JSON. Empty query values
    /// are left out.
    pub async fn request<B: Serialize + ?Sized>(
        &self,
        method: &str,
        path: &str,
        body: Option<&B>,
        query: &[(&str, &str)],
        idempotency_key: Option<&str>,
    ) -> Result<Value> {
        let mut url = format!("{}{}", self.base_url, path);
        let mut sep = if path.contains('?') { '&' } else { '?' };
        for (k, v) in query.iter().filter(|(_, v)| !v.is_empty()) {
            url.push(sep);
            url.push_str(&query_enc(k));
            url.push('=');
            url.push_str(&query_enc(v));
            sep = '&';
        }
        let payload = match body {
            Some(b) => Some(serde_json::to_string(b).map_err(|e| {
                Error::Invalid(format!("Couldn't serialise the request body: {e}"))
            })?),
            None => None,
        };
        let method = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|_| Error::Invalid(format!("Invalid method {method}")))?;
        // GET and DELETE are safe to repeat; POST and PATCH only with an idempotency key.
        let retryable = method == reqwest::Method::GET
            || method == reqwest::Method::DELETE
            || idempotency_key.is_some();

        let mut attempt = 0u32;
        loop {
            let mut req = self
                .http
                .request(method.clone(), &url)
                .timeout(self.timeout)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("Accept", "application/json")
                .header("User-Agent", format!("delivrie-rust/{VERSION}"));
            for (k, v) in &self.headers {
                req = req.header(k.as_str(), v.as_str());
            }
            if let Some(k) = idempotency_key {
                req = req.header("Idempotency-Key", k);
            }
            if let Some(p) = &payload {
                req = req
                    .header("Content-Type", "application/json")
                    .body(p.clone());
            }
            let res = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    if retryable && attempt < self.max_retries {
                        tokio::time::sleep(backoff(attempt)).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(if e.is_timeout() {
                        Error::Timeout
                    } else {
                        Error::Network(e.to_string())
                    });
                }
            };
            let status = res.status().as_u16();
            let retry_after = res
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.trim().parse::<u64>().ok());
            let raw = match res.text().await {
                Ok(t) => t,
                Err(e) => {
                    if retryable && attempt < self.max_retries {
                        tokio::time::sleep(backoff(attempt)).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(if e.is_timeout() {
                        Error::Timeout
                    } else {
                        Error::Network(e.to_string())
                    });
                }
            };
            let json: Value = if raw.trim().is_empty() {
                Value::Null
            } else {
                serde_json::from_str(&raw).unwrap_or(Value::Null)
            };
            if (200..300).contains(&status) {
                return Ok(match json {
                    Value::Object(_) => json,
                    Value::Null => Value::Object(Default::default()),
                    other => serde_json::json!({ "data": other }),
                });
            }
            if (status == 429 || status >= 500) && retryable && attempt < self.max_retries {
                let wait = match retry_after {
                    Some(s) if s > 0 => Duration::from_secs(s.min(30)),
                    _ => backoff(attempt),
                };
                tokio::time::sleep(wait).await;
                attempt += 1;
                continue;
            }
            return Err(Error::from_response(status, &json, &raw));
        }
    }
}

fn backoff(attempt: u32) -> Duration {
    let jitter = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() % 250)
        .unwrap_or(0);
    Duration::from_millis((500u64 << attempt.min(4)).min(8000) + u64::from(jitter))
}

fn query_enc(s: &str) -> String {
    enc(s)
}
