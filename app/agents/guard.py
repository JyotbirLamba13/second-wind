"""Guardrails on model output. The model may only restate facts the report already holds.

Every check here is deterministic. When model text fails one, callers drop it and use their rule-based text instead,
so a hallucinated patent, number, date or legal conclusion never reaches the user.
"""
from __future__ import annotations

import re
from typing import Iterable

from ..retrieval import tokenize

# US10517314B2, US 10,517,314 B2, USRE49123E, MOCK-ab12cd34ef-3, SL-S007, and bare 7-8 digit patent numbers.
_PATENT_ID = re.compile(
    r"\bUS\s?(?:RE|D|PP)?\s?\d{1,2}[,\d]{5,}\s?(?:[A-Z]\d?)?\b|\bMOCK-[0-9a-f]+-\d+\b|\bSL-S\d+\b|\b\d{1,2},\d{3},\d{3}\b|\b\d{7,8}\b",
    re.I,
)
_PERCENT = re.compile(r"(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)", re.I)
_YEAR = re.compile(r"\b(19[5-9]\d|20\d\d)\b")

# Conclusions only a registered practitioner may give. Matching any of these rejects the text.
_LEGAL_CONCLUSIONS = [re.compile(p, re.I) for p in (
    r"\b(?:you|your|the)\b[^.]{0,60}\b(?:will not|won't|does not|doesn't|do not|don't|cannot|can't|would not|wouldn't)\s+infringe",
    r"\b(?:is|are|would be|will be)\s+(?:not\s+)?infring(?:ing|ed)\b",
    r"\bno (?:infringement|legal) risk\b",
    r"\b(?:you are|you're|it is|it's)\s+(?:free|safe|clear)\s+to\s+(?:use|make|sell|build|launch|manufacture|proceed|commercialize|practice)",
    r"\bsafe to (?:use|make|sell|build|launch|manufacture|proceed|commercialize)\b",
    r"\b(?:is|are|would be|will be)\s+(?:not\s+)?(?:patentable|unpatentable|invalid|unenforceable)\b",
    r"\b(?:you can|you could|you will|you'll)\s+(?:get|obtain|secure)\s+(?:a\s+)?patent\b",
    r"\bguarantee[sd]?\b",
    r"\bthis (?:is|constitutes) legal advice\b",
)]

_LEGAL_TOPIC = re.compile(r"\b(?:infring\w*|sue\w*|lawsuit\w*|litigat\w*|licen[cs]\w*|legal\w*|patentab\w*|valid\w*|royalt\w*|freedom to operate|fto)\b", re.I)
ATTORNEY_LINE = "For anything about infringement, licensing or other legal risk, talk to a registered patent attorney."


def norm_id(s: str) -> str:
    return re.sub(r"[\s,]", "", s).upper()


def patent_ids(text: str) -> set[str]:
    return {norm_id(m) for m in _PATENT_ID.findall(text)}


def _id_allowed(found: str, allowed: set[str]) -> bool:
    # "10517314" or "US10517314" may name an allowed id without its kind code.
    return any(a == found or a.startswith(found if found.startswith(("US", "MOCK", "SL")) else "US" + found) for a in allowed)


def unknown_ids(text: str, allowed: Iterable[str]) -> set[str]:
    allowed_n = {norm_id(a) for a in allowed}
    return {i for i in patent_ids(text) if not _id_allowed(i, allowed_n)}


def legal_conclusion(text: str) -> str | None:
    for p in _LEGAL_CONCLUSIONS:
        m = p.search(text)
        if m:
            return m.group(0)
    return None


def ungrounded_numbers(text: str, context: str) -> list[str]:
    """Percentages and years in `text` that `context` doesn't contain (percentages within one point)."""
    have_pct = [float(x) for x in _PERCENT.findall(context)]
    bad = [f"{p}%" for p in _PERCENT.findall(text) if not any(abs(float(p) - h) <= 1 for h in have_pct)]
    have_years = set(_YEAR.findall(context))
    bad += [y for y in _YEAR.findall(text) if y not in have_years]
    return bad


def novel_ratio(text: str, sources: Iterable[str]) -> float:
    """Share of the text's content words that appear in none of the sources: 0 = fully grounded."""
    words = set(tokenize(text))
    if not words:
        return 0.0
    known = set(tokenize(" ".join(sources)))
    return len(words - known) / len(words)


def mentions_legal_topic(text: str) -> bool:
    return bool(_LEGAL_TOPIC.search(text))


def check_text(text: str, *, allowed_ids: Iterable[str], context: str, max_len: int,
               must_mention: Iterable[str] = (), sources: Iterable[str] = (), max_novel: float | None = None) -> str | None:
    """Return why `text` fails the guardrails, or None when it passes."""
    if not isinstance(text, str) or not text.strip():
        return "empty"
    if len(text) > max_len:
        return "too long"
    if bad := unknown_ids(text, allowed_ids):
        return f"unknown patent ids {sorted(bad)}"
    if phrase := legal_conclusion(text):
        return f"legal conclusion: {phrase!r}"
    if bad := ungrounded_numbers(text, context):
        return f"numbers not in the report: {bad}"
    for pid in must_mention:
        if norm_id(pid) not in {norm_id(i) for i in patent_ids(text)}:
            return f"drops {pid}"
    if max_novel is not None and novel_ratio(text, sources) > max_novel:
        return "strays from the source text"
    return None
