"""Webhook signature verification (Standard Webhooks).

Delivrie signs every webhook with webhook-id, webhook-timestamp and webhook-signature headers. The signature is
"v1,<base64 HMAC-SHA256 of '{id}.{timestamp}.{body}'>" keyed with the endpoint's whsec_ signing secret.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time
from typing import Any, Mapping, Optional, Union

from ._errors import WebhookVerificationError


def _header(headers: Mapping[str, Any], name: str) -> Optional[str]:
    getter = getattr(headers, "get", None)
    value = None
    if getter is not None:
        value = getter(name)
        if value is None:
            value = getter(name.title())
    if value is None:
        for k in headers.keys():
            if str(k).lower() == name:
                value = headers[k]
                break
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    return None if value is None else str(value)


def verify_webhook(
    payload: Union[str, bytes, bytearray],
    headers: Mapping[str, Any],
    secret: str,
    *,
    tolerance_seconds: int = 300,
) -> Any:
    """Check that a webhook came from Delivrie and isn't a replay, then return the parsed event.

    Pass the raw request body exactly as received (before any JSON parsing), the request headers and the
    endpoint's signing secret. Raises WebhookVerificationError if anything doesn't check out.

        event = verify_webhook(request.body, request.headers, os.environ["DELIVRIE_WEBHOOK_SECRET"])
    """
    if not secret:
        raise WebhookVerificationError("Missing signing secret")
    msg_id = _header(headers, "webhook-id")
    timestamp = _header(headers, "webhook-timestamp")
    signatures = _header(headers, "webhook-signature")
    if not msg_id or not timestamp or not signatures:
        raise WebhookVerificationError("Missing webhook-id, webhook-timestamp or webhook-signature header")
    try:
        ts = int(timestamp)
    except ValueError:
        raise WebhookVerificationError("Invalid webhook-timestamp header") from None
    if abs(int(time.time()) - ts) > tolerance_seconds:
        raise WebhookVerificationError("Webhook timestamp is too old or in the future")

    body = payload.decode("utf-8") if isinstance(payload, (bytes, bytearray)) else payload
    try:
        key = base64.b64decode(secret[6:] if secret.startswith("whsec_") else secret, validate=True)
    except (binascii.Error, ValueError):
        raise WebhookVerificationError("Signing secret isn't valid base64") from None
    expected = hmac.new(key, f"{msg_id}.{ts}.{body}".encode("utf-8"), hashlib.sha256).digest()

    # The header can hold several space-separated signatures (during secret rotation); any valid one is enough.
    for part in signatures.split(" "):
        version, _, sig = part.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            if hmac.compare_digest(base64.b64decode(sig), expected):
                break
        except (binascii.Error, ValueError):
            continue
    else:
        raise WebhookVerificationError("Signature doesn't match")

    try:
        return json.loads(body)
    except ValueError:
        raise WebhookVerificationError("Body is not valid JSON") from None
