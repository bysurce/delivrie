# Delivrie for Python

The official Python SDK for [Delivrie](https://delivrie.io), the email API for transactional email, broadcasts, automations and a shared inbox.

- No dependencies: the standard library only
- Python 3.10+, sync and async (`AsyncDelivrie`)
- Safe retries: rate limits, server errors and network errors are retried, and sends only with an idempotency key, so an email is never sent twice
- Webhook signature verification built in

## Install

```bash
pip install delivrie
```

## Send an email

Create an API key at [delivrie.io/api-keys](https://delivrie.io/api-keys) and set it as `DELIVRIE_API_KEY`.

```python
from delivrie import Delivrie

client = Delivrie()  # reads DELIVRIE_API_KEY

email = client.emails.send(
    from_="Acme <hello@mail.acme.com>",
    to="ada@example.com",
    subject="Welcome to Acme",
    html="<p>Thanks for signing up.</p>",
    idempotency_key="welcome-ada",
)
print(email["id"])
```

`from` is a Python keyword, so pass `from_`, or send a dict exactly like the REST API:

```python
client.emails.send({"from": "Acme <hello@mail.acme.com>", "to": ["ada@example.com"], "subject": "Hi", "text": "Hello"})
```

Python values are converted for you: `datetime` for `scheduled_at`, `bytes` for attachment content, and a dict for `tags`.

```python
from datetime import datetime, timedelta, timezone

client.emails.send(
    from_="Acme <billing@mail.acme.com>",
    to="ada@example.com",
    subject="Your invoice",
    html="<p>Attached.</p>",
    attachments=[{"filename": "invoice.pdf", "content": open("invoice.pdf", "rb").read()}],
    tags={"category": "invoice"},
    scheduled_at=datetime.now(timezone.utc) + timedelta(hours=1),
)
```

### Templates

```python
client.emails.send(
    from_="Acme <hello@mail.acme.com>",
    to="ada@example.com",
    template={"id": "welcome", "variables": {"first_name": "Ada"}},
)
```

### Batch

```python
client.emails.batch([
    {"from": "Acme <hello@mail.acme.com>", "to": "ada@example.com", "subject": "Hi Ada", "text": "Hello"},
    {"from": "Acme <hello@mail.acme.com>", "to": "sam@example.com", "subject": "Hi Sam", "text": "Hello"},
], idempotency_key="digest-2026-11-14")
```

## Errors

Methods return the API's JSON as a dict and raise `DelivrieError` when something goes wrong:

```python
from delivrie import DelivrieError

try:
    client.emails.send(from_="Acme <hello@mail.acme.com>", to="ada@example.com", subject="Hi", text="Hello")
except DelivrieError as e:
    print(e.status_code, e.name, e.message)  # 422 validation_error The from domain ... is not verified yet
```

`status_code` is `0` for problems that never reached the API (`network_error` or `timeout`). Every error name is listed at [delivrie.io/docs/errors](https://delivrie.io/docs/errors).

## Async

```python
from delivrie import AsyncDelivrie

client = AsyncDelivrie()

@app.post("/signup")
async def signup(email: str):
    await client.emails.send(from_="Acme <hello@mail.acme.com>", to=email, subject="Welcome", text="Hi!",
                             idempotency_key=f"welcome-{email}")
```

## Webhooks

Verify the signature with the raw body, before parsing it:

```python
import os
from delivrie import verify_webhook, WebhookVerificationError

# Flask
@app.post("/webhooks/delivrie")
def delivrie_webhook():
    try:
        event = verify_webhook(request.get_data(), request.headers, os.environ["DELIVRIE_WEBHOOK_SECRET"])
    except WebhookVerificationError:
        return "", 400
    if event["type"] == "email.bounced":
        ...
    return "", 204
```

In Django, pass `request.body` and `request.headers`; in FastAPI, `await request.body()` and `request.headers`.

## Everything else

The client covers the whole API with the same names as the [Node.js SDK](https://www.npmjs.com/package/delivrie), in snake_case:

| | |
| --- | --- |
| `client.emails` | `send`, `batch`, `get`, `list`, `list_received`, `update`, `cancel`, `forward` |
| `client.domains` | `create`, `get`, `verify`, `update`, `list`, `remove` |
| `client.api_keys` | `create`, `list`, `remove` |
| `client.webhooks` | `create`, `list`, `deliveries`, `test`, `replay`, `verify` |
| `client.contacts` | `create`, `get`, `update`, `list`, `remove` |
| `client.segments` | `create`, `list`, `remove`, `add_contacts` |
| `client.broadcasts` | `create`, `get`, `list`, `send`, `cancel`, `recipients`, `remove` |
| `client.templates` | `create`, `get`, `list`, `publish` |
| `client.suppressions` | `add`, `list`, `remove` |
| `client.events` | `send`, `list` |
| `client.automations` | `list`, `get`, `create`, `runs`, `publish`, `pause`, `resume` |
| `client.inbox.threads` | `list`, `get`, `update`, `reply` |
| `client.topics`, `client.contact_properties`, `client.inbox.labels` | `list` |
| `client.metrics`, `client.usage` | `get` |
| `client.logs` | `list`, `get` |

For anything else, `client.request("GET", "/path")` calls the API directly.

## Options

```python
Delivrie(
    api_key="dlv_...",          # default: DELIVRIE_API_KEY
    base_url="https://...",     # default: https://delivrie.io/api (or DELIVRIE_BASE_URL)
    timeout=30,                 # seconds per request
    max_retries=2,
    headers={"X-Request-Source": "billing-service"},
)
```

## Links

- [Python guide](https://delivrie.io/docs/python)
- [API reference](https://delivrie.io/docs/api)
- [Test addresses](https://delivrie.io/docs/test-mode): send to `delivered@test.delivrie.io` while developing

MIT licensed.
