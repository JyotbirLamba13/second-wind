"""Tiny in-memory sliding-window limiter so a public demo can't burn the LLM quota."""
import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

WINDOW = 600  # seconds
_hits: dict[str, deque] = defaultdict(deque)


def limit(request: Request) -> None:
    cap = int(os.getenv("RATE_LIMIT_PER_10MIN", "12"))
    if cap <= 0:
        return
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    now, q = time.time(), _hits[ip]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= cap:
        raise HTTPException(429, f"Demo limit reached ({cap} checks per 10 minutes). Please wait a few minutes.")
    q.append(now)
