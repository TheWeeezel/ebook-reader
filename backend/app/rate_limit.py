"""Small in-memory per-client rate limiter for public mobile endpoints."""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

_requests: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def require_rate_limit(
    request: Request,
    limit: int,
    window_seconds: int = 60,
    scope: str = "default",
) -> None:
    if limit <= 0:
        return

    now = time.monotonic()
    cutoff = now - window_seconds
    key = f"{scope}:{_client_key(request)}"

    with _lock:
        entries = _requests[key]
        while entries and entries[0] < cutoff:
            entries.popleft()
        if len(entries) >= limit:
            raise HTTPException(status_code=429, detail="rate limit exceeded")
        entries.append(now)
