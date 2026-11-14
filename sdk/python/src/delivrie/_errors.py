from __future__ import annotations

from typing import Any


class DelivrieError(Exception):
    """An error returned by the Delivrie API, or a network problem (status_code 0).

    Branch on `name` (for example "validation_error", "daily_quota_exceeded" or "sending_paused") and show
    `message` to people: it says exactly what went wrong. See https://delivrie.io/docs/errors
    """

    def __init__(self, status_code: int, name: str, message: str, *, body: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.name = name
        self.message = message
        self.body = body

    def __str__(self) -> str:
        return f"{self.name}: {self.message}" if self.status_code == 0 else f"{self.status_code} {self.name}: {self.message}"

    def __repr__(self) -> str:
        return f"DelivrieError(status_code={self.status_code!r}, name={self.name!r}, message={self.message!r})"


class WebhookVerificationError(Exception):
    """The webhook request isn't from Delivrie, was changed, or is too old."""
