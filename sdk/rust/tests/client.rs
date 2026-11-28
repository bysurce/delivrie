use delivrie::{Client, Error};
use serde_json::json;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
struct Seen {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}

impl Seen {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// A tiny HTTP server that answers with queued (status, body) pairs and records each request.
fn server(responses: Vec<(u16, &'static str)>) -> (Client, Arc<Mutex<Vec<Seen>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let queue = Arc::new(Mutex::new(VecDeque::from(responses)));
    let s2 = seen.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 {
                continue;
            }
            let mut parts = line.split_whitespace();
            let method = parts.next().unwrap_or("").to_owned();
            let path = parts.next().unwrap_or("").to_owned();
            let mut headers = Vec::new();
            let mut len = 0usize;
            loop {
                let mut h = String::new();
                reader.read_line(&mut h).unwrap();
                let h = h.trim_end().to_owned();
                if h.is_empty() {
                    break;
                }
                if let Some((k, v)) = h.split_once(':') {
                    if k.eq_ignore_ascii_case("content-length") {
                        len = v.trim().parse().unwrap_or(0);
                    }
                    headers.push((k.trim().to_owned(), v.trim().to_owned()));
                }
            }
            let mut body = vec![0u8; len];
            reader.read_exact(&mut body).unwrap();
            s2.lock().unwrap().push(Seen {
                method,
                path,
                headers,
                body: String::from_utf8(body).unwrap(),
            });
            let (status, resp) = queue.lock().unwrap().pop_front().unwrap_or((200, "{}"));
            let msg = format!("HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{resp}", resp.len());
            let _ = stream.write_all(msg.as_bytes());
        }
    });
    let client = Client::builder()
        .api_key("dlv_test")
        .base_url(format!("http://127.0.0.1:{port}/api"))
        .max_retries(2)
        .build()
        .unwrap();
    (client, seen)
}

fn paths(seen: &Arc<Mutex<Vec<Seen>>>) -> Vec<String> {
    seen.lock()
        .unwrap()
        .iter()
        .map(|s| format!("{} {}", s.method, s.path.trim_start_matches("/api")))
        .collect()
}

#[tokio::test]
async fn sends_email() {
    let (d, seen) = server(vec![(200, r#"{"id":"e1"}"#)]);
    let out = d
        .emails()
        .send_idempotent(
            &json!({ "from": "Acme <hi@acme.com>", "to": ["ada@example.com"], "subject": "Hi" }),
            "k1",
        )
        .await
        .unwrap();
    assert_eq!(out["id"], "e1");
    let s = seen.lock().unwrap()[0].clone();
    assert_eq!(format!("{} {}", s.method, s.path), "POST /api/emails");
    assert_eq!(s.header("authorization"), Some("Bearer dlv_test"));
    assert_eq!(s.header("idempotency-key"), Some("k1"));
    assert_eq!(s.header("content-type"), Some("application/json"));
    assert!(s
        .header("user-agent")
        .unwrap()
        .starts_with("delivrie-rust/"));
    let body: serde_json::Value = serde_json::from_str(&s.body).unwrap();
    assert_eq!(body["to"][0], "ada@example.com");
}

#[tokio::test]
async fn encodes_ids_queries_and_empty_bodies() {
    let (d, seen) = server(vec![]);
    d.contacts().get("ada+1@example.com").await.unwrap();
    d.segments()
        .contacts("s 1", &[("limit", "5"), ("offset", "")])
        .await
        .unwrap();
    d.inbox()
        .threads(&[("needs_reply", "true"), ("q", "label:billing")])
        .await
        .unwrap();
    d.broadcasts().cancel("b1").await.unwrap();
    d.broadcasts().send("b1", None).await.unwrap();
    assert_eq!(
        paths(&seen),
        vec![
            "GET /contacts/ada%2B1%40example.com",
            "GET /segments/s%201/contacts?limit=5",
            "GET /inbox/threads?needs_reply=true&q=label%3Abilling",
            "POST /broadcasts/b1/cancel",
            "POST /broadcasts/b1/send"
        ]
    );
    assert_eq!(seen.lock().unwrap()[3].body, "{}");
    assert_eq!(seen.lock().unwrap()[4].body, "{}");
}

#[tokio::test]
async fn new_endpoints() {
    let (d, seen) = server(vec![]);
    d.broadcasts()
        .duplicate("b1", Some(&json!({ "name": "Copy" })))
        .await
        .unwrap();
    d.broadcasts().links("b1").await.unwrap();
    d.templates()
        .edit_content(
            "welcome",
            &json!({ "ops": [{ "op": "delete", "id": "x" }] }),
        )
        .await
        .unwrap();
    d.api_keys()
        .update("k1", &json!({ "name": "Prod" }))
        .await
        .unwrap();
    d.emails().received_attachments("e1").await.unwrap();
    d.segments()
        .remove_contacts("s1", &json!({ "contacts": ["a@b.com"] }))
        .await
        .unwrap();
    d.contacts()
        .import_contacts(&json!({ "csv": "email\na@b.com" }))
        .await
        .unwrap();
    d.ai()
        .draft(&json!({ "url": "https://acme.com" }))
        .await
        .unwrap();
    assert_eq!(
        paths(&seen),
        vec![
            "POST /broadcasts/b1/duplicate",
            "GET /broadcasts/b1/links",
            "POST /templates/welcome/content",
            "PATCH /api-keys/k1",
            "GET /emails/received/e1/attachments",
            "DELETE /segments/s1/contacts",
            "POST /contacts/imports",
            "POST /ai/draft"
        ]
    );
    assert_eq!(seen.lock().unwrap()[5].body, r#"{"contacts":["a@b.com"]}"#);
}

#[tokio::test]
async fn api_errors() {
    let (d, _) = server(vec![(
        422,
        r#"{"statusCode":422,"name":"validation_error","message":"Missing `to`"}"#,
    )]);
    let e = d.emails().send(&json!({ "from": "a" })).await.unwrap_err();
    assert_eq!(e.status(), 422);
    assert_eq!(e.name(), "validation_error");
    assert!(matches!(e, Error::Api { ref message, .. } if message == "Missing `to`"));
}

#[tokio::test]
async fn retries_safe_requests_only() {
    let (d, seen) = server(vec![(503, "oops"), (200, r#"{"object":"list","data":[]}"#)]);
    assert_eq!(d.domains().list().await.unwrap()["object"], "list");
    assert_eq!(seen.lock().unwrap().len(), 2);

    let (d, seen) = server(vec![(503, "oops"), (200, "{}")]);
    assert_eq!(
        d.emails()
            .send(&json!({ "from": "a" }))
            .await
            .unwrap_err()
            .status(),
        503
    );
    assert_eq!(seen.lock().unwrap().len(), 1);

    let (d, _) = server(vec![(429, "{}"), (200, r#"{"id":"e2"}"#)]);
    assert_eq!(
        d.emails()
            .send_idempotent(&json!({ "from": "a" }), "k")
            .await
            .unwrap()["id"],
        "e2"
    );
}

#[tokio::test]
async fn wraps_arrays_and_needs_a_key() {
    let (d, _) = server(vec![(200, "[1]")]);
    assert_eq!(d.logs().list(&[]).await.unwrap()["data"][0], 1);
    if std::env::var("DELIVRIE_API_KEY").is_err() {
        assert!(Client::builder().api_key("").build().is_err());
    }
}
