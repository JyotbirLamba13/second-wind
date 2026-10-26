"""Patent loading and report persistence."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import date
from pathlib import Path
from typing import Optional

from .patents import Patent, legal_status
from .retrieval import Index


def load_patents(path: str) -> list[Patent]:
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(Patent.model_validate_json(line))
    return out


class PatentStore:
    def __init__(self, path: str, today: Optional[date] = None):
        self.path = path
        self.today = today or date.today()
        self.index = Index(load_patents(path))
        self.status = {i: legal_status(p, self.today) for i, p in self.index.patents.items()}

    @property
    def patents(self):
        return self.index.patents

    def ids_with_status(self, *statuses: str) -> set[str]:
        return {i for i, s in self.status.items() if s.status in statuses}


class ReportDB:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.conn.execute(
                "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, kind TEXT, created_at TEXT, body TEXT)"
            )
            self.conn.commit()

    def save(self, report_id: str, kind: str, created_at: str, body: dict) -> None:
        with self.lock:
            self.conn.execute(
                "INSERT OR REPLACE INTO reports VALUES (?,?,?,?)", (report_id, kind, created_at, json.dumps(body))
            )
            self.conn.commit()

    def get(self, report_id: str) -> Optional[dict]:
        with self.lock:
            row = self.conn.execute("SELECT body FROM reports WHERE id=?", (report_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def list(self, kind: Optional[str] = None, limit: int = 50) -> list[dict]:
        q, args = "SELECT id, kind, created_at FROM reports", []
        if kind:
            q += " WHERE kind=?"
            args.append(kind)
        q += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        with self.lock:
            rows = self.conn.execute(q, args).fetchall()
        return [{"id": r[0], "kind": r[1], "created_at": r[2]} for r in rows]
