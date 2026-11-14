"""AsyncDelivrie: the same API for asyncio apps (FastAPI, aiohttp, Django async views).

Each call runs the standard-library client in a worker thread, so it never blocks the event loop and the package
stays dependency-free.
"""
from __future__ import annotations

import asyncio
import functools
from typing import Any

from ._client import Delivrie


class _AsyncProxy:
    def __init__(self, target: Any) -> None:
        self._target = target

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._target, name)
        if callable(attr):
            @functools.wraps(attr)
            async def call(*args: Any, **kwargs: Any) -> Any:
                return await asyncio.to_thread(attr, *args, **kwargs)
            return call
        if name.startswith("_") or isinstance(attr, (str, int, float, bool, type(None))):
            return attr
        return _AsyncProxy(attr)

    def __repr__(self) -> str:
        return f"Async{self._target!r}"


class AsyncDelivrie(_AsyncProxy):
    """
        from delivrie import AsyncDelivrie

        client = AsyncDelivrie()
        email = await client.emails.send(from_="Acme <hello@mail.acme.com>", to="ada@example.com",
                                          subject="Welcome", html="<p>Hi</p>")
    """

    def __init__(self, api_key: Any = None, **options: Any) -> None:
        super().__init__(Delivrie(api_key, **options))
