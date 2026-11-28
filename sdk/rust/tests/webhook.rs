use base64::{engine::general_purpose::STANDARD, Engine};
use delivrie::webhook::{verify_at, WebhookError};
use hmac::{Hmac, Mac};
use sha2::Sha256;

const BODY: &str = r#"{"type":"email.delivered","data":{"email_id":"e1"}}"#;

fn sign(key: &[u8], ts: i64, body: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).unwrap();
    mac.update(format!("msg_1.{ts}.{body}").as_bytes());
    format!("v1,{}", STANDARD.encode(mac.finalize().into_bytes()))
}

fn headers(key: &[u8]) -> Vec<(String, String)> {
    vec![
        ("Webhook-Id".into(), "msg_1".into()),
        ("webhook-timestamp".into(), "1700000000".into()),
        (
            "WEBHOOK-SIGNATURE".into(),
            format!("v1,bm9wZQ== {}", sign(key, 1700000000, BODY)),
        ),
    ]
}

#[test]
fn verifies_and_rejects() {
    let key = b"secret-key-bytes";
    let secret = format!("whsec_{}", STANDARD.encode(key));
    let ev = verify_at(BODY, headers(key), &secret, 300, 1700000100).unwrap();
    assert_eq!(ev["type"], "email.delivered");
    let bad: Vec<Result<serde_json::Value, WebhookError>> = vec![
        verify_at(&format!("{BODY} "), headers(key), &secret, 300, 1700000000),
        verify_at(BODY, headers(key), &secret, 300, 1700001000),
        verify_at(BODY, headers(b"other"), &secret, 300, 1700000000),
        verify_at(
            BODY,
            Vec::<(String, String)>::new(),
            &secret,
            300,
            1700000000,
        ),
    ];
    assert!(bad.iter().all(|r| r.is_err()));
}
