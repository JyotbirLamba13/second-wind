"""Demo data for industries outside the live dataset: the LLM invents plausible patents, clearly flagged as mock."""
from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Optional

from ..patents import Patent
from ..schemas import Understanding
from ..store import PatentStore
from .llm import LLM

SYSTEM = (
    "Invent realistic but fictional US utility patents for a product demo. Reply with JSON key 'patents': a list of 6 objects "
    "with keys title, abstract (1-2 sentences), claim1 (a detailed independent claim, 30-50 words, patent style), "
    "cpc (list of 1-3 CPC codes), filing_year (int), status ('in_force' or 'expired'), assignee (fictional company). "
    "Make 2 patents overlap closely with the user's idea (in force): their claim1 must reuse the idea's own key nouns and features nearly word for word, 2 partially overlap, and 2 be loosely related. "
    "Make 1 of the loosely related ones expired with filing_year 2005 or earlier. These are fictional; never copy real patent text."
)
_cache: dict[str, PatentStore] = {}


def in_live_domain(u: Understanding, store: PatentStore) -> bool:
    """True when the live dataset can answer: no restriction, no CPC guess, or a guess inside the loaded class."""
    if not store.live_subclasses:
        return True  # mixed corpus: no single industry to be outside of
    if not u.in_dataset:
        return False
    return not u.cpc_hints or any(h[:4] in store.live_subclasses for h in u.cpc_hints)


def mock_store(idea: str, u: Understanding, base: PatentStore, llm: Optional[LLM]) -> Optional[PatentStore]:
    key = hashlib.sha1((u.industry or "|".join(sorted(u.cpc_hints)) or u.summary).lower().encode()).hexdigest()[:10]
    if key in _cache:
        return _cache[key]
    if not llm or not llm.enabled:
        return None
    out = llm.json_call(SYSTEM, json.dumps({"idea": idea, "industry": u.industry, "features": u.features}), max_tokens=2200)
    rows = out.get("patents") if out else None
    if not isinstance(rows, list):
        return None
    patents = []
    for n, r in enumerate(rows[:10], 1):
        try:
            expired = r.get("status") == "expired"
            fy = int(r["filing_year"])
            fy = min(fy, 2005) if expired else max(min(fy, 2023), 2008)
            filing, grant = date(fy, 3, 1), date(min(fy + 2, 2025), 6, 1)
            patents.append(Patent(
                id=f"MOCK-{key}-{n}", title=str(r["title"]), abstract=str(r.get("abstract", "")), claims=[f"1. {r['claim1']}"],
                cpc=[str(c) for c in r.get("cpc", [])][:3], filing_date=filing, grant_date=grant,
                assignee=str(r.get("assignee", "")) or None, synthetic=True, mock=True))
        except (KeyError, TypeError, ValueError):
            continue
    if len(patents) < 3:
        return None
    _cache[key] = PatentStore(patents=patents, today=base.today)
    return _cache[key]
