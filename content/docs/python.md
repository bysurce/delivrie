---
title: Python
group: SDKs and frameworks
order: 4
description: Send email from Python, Django, Flask and FastAPI with Delivrie using requests or httpx, verify webhooks, or use Django's SMTP backend.
---
There's no Python package yet. The API is a single JSON request, so `requests` or `httpx` is all you need. (Already using the `resend` package? Set `RESEND_API_URL=https://delivrie.io/api` and it talks to Delivrie; see [Migrate from Resend](/docs/migrate-from-resend).)

## Send an email

```python send.py
import os
import requests

def send_email(to, subject, html, idempotency_key=None):
    res = requests.post(
        "https://delivrie.io/api/emails",
        headers={
            "Authorization": f"Bearer {os.environ['DELIVRIE_API_KEY']}",
            **({"Idempotency-Key": idempotency_key} if idempotency_key else {}),
        },
        json={
            "from": "Acme <hello@mail.acme.com>",
            "to": to,
            "subject": subject,
            "html": html,
        },
        timeout=30,
    )
    body = res.json()
    if not res.ok:
        raise RuntimeError(f"{body['name']}: {body['message']}")
    return body["id"]

send_email("ada@example.com", "Welcome", "<p>Welcome to Acme</p>", idempotency_key="welcome-42")
```

## Async (FastAPI, httpx)

```python main.py
import os
import httpx
from fastapi import FastAPI, HTTPException

app = FastAPI()
client = httpx.AsyncClient(
    base_url="https://delivrie.io/api",
    headers={"Authorization": f"Bearer {os.environ['DELIVRIE_API_KEY']}"},
    timeout=30,
)

@app.post("/signup")
async def signup(email: str):
    res = await client.post("/emails", json={
        "from": "Acme <hello@mail.acme.com>",
        "to": email,
        "subject": "Welcome",
        "html": "<p>Thanks for signing up.</p>",
    }, headers={"Idempotency-Key": f"welcome-{email}"})
    if res.is_error:
        raise HTTPException(502, res.json()["message"])
    return {"email_id": res.json()["id"]}
```

## Attachments

```python
import base64

with open("invoice.pdf", "rb") as f:
    content = base64.b64encode(f.read()).decode()

payload["attachments"] = [{"filename": "invoice.pdf", "content": content}]
```

## Django

The simplest setup is Django's SMTP backend with the [SMTP relay](/docs/smtp), so `send_mail` and password-reset emails go through Delivrie:

```python settings.py
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.delivrie.io"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = "delivrie"
EMAIL_HOST_PASSWORD = os.environ["DELIVRIE_API_KEY"]
DEFAULT_FROM_EMAIL = "Acme <hello@mail.acme.com>"
```

## Flask

```python app.py
import os, requests
from flask import Flask, request

app = Flask(__name__)

@app.post("/contact")
def contact():
    res = requests.post(
        "https://delivrie.io/api/emails",
        headers={"Authorization": f"Bearer {os.environ['DELIVRIE_API_KEY']}"},
        json={
            "from": "Website <forms@mail.acme.com>",
            "to": "team@acme.com",
            "reply_to": request.form["email"],
            "subject": "New contact form message",
            "text": request.form["message"],
        },
        timeout=30,
    )
    return ("Sent", 200) if res.ok else (res.json()["message"], 502)
```

## Verify webhooks

```python webhooks.py
import base64, hashlib, hmac, json, os, time

def verify_webhook(payload: bytes, headers: dict, secret: str, tolerance: int = 300) -> dict:
    msg_id = headers["webhook-id"]
    timestamp = headers["webhook-timestamp"]
    if abs(time.time() - int(timestamp)) > tolerance:
        raise ValueError("timestamp too old")
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + payload
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for sig in headers["webhook-signature"].split():
        version, _, value = sig.partition(",")
        if version == "v1" and hmac.compare_digest(value, expected):
            return json.loads(payload)
    raise ValueError("invalid signature")
```

In Flask pass `request.get_data()` and `{k.lower(): v for k, v in request.headers.items()}`; in Django, `request.body` and `{k.lower(): v for k, v in request.headers.items()}`. The [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package does the same thing.
