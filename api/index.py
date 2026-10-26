"""Vercel serverless entrypoint: the same FastAPI app, with state built at import time.

Vercel may not run ASGI lifespan events, so the patent index is built once per cold start here and the
lifespan hook is replaced with a no-op. Only /tmp is writable on Vercel, so reports go there.
"""
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)  # data paths in Settings are relative to the repo root
os.environ.setdefault("SECOND_LIFE_DB", "/tmp/second_life.db")

from app.agents.llm import LLM  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.store import PatentStore, ReportDB  # noqa: E402

settings = get_settings()
api = create_app(settings)


@asynccontextmanager
async def _noop(_app):
    yield


api.router.lifespan_context = _noop
api.state.store = PatentStore(settings.data_path)
api.state.db = ReportDB(settings.db_path)
api.state.llm = LLM(settings)


async def app(scope, receive, send):
    """The frontend calls /api/v1/...; the FastAPI routes live at /v1/..., so strip the prefix."""
    if scope["type"] in ("http", "websocket") and scope["path"].startswith("/api"):
        scope = {**scope, "path": scope["path"][4:] or "/", "raw_path": None}
    await api(scope, receive, send)
