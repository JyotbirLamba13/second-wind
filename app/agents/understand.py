"""Step 1 of Check: an LLM turns a founder's plain-language idea into patent search vocabulary."""
from __future__ import annotations

import json
import re

from ..schemas import Understanding
from .llm import LLM

SYSTEM_TMPL = (
    "You help a first-time hardware founder search patents. Given a product idea, reply with JSON keys: "
    "summary (one sentence, plain English), features (3-6 core technical features), "
    "search_terms (8-15 words patents would use, including synonyms and claim-style wording), "
    "industry (2-4 word label), in_dataset (true ONLY if the idea is squarely about {domain}, otherwise false), cpc_hints (up to 3 CPC codes like A47J31 that fit; omit if unsure)."
)


def understand_idea(idea: str, llm: LLM | None, domain: str = "") -> Understanding:
    if llm and llm.enabled:
        out = llm.json_call(SYSTEM_TMPL.replace("{domain}", domain or "the loaded dataset"), idea, max_tokens=500)
        if out:
            def strs(key: str, limit: int) -> list[str]:
                v = out.get(key)
                return [str(x).strip() for x in v if str(x).strip()][:limit] if isinstance(v, list) else []

            cpc = [c.replace(" ", "").upper() for c in strs("cpc_hints", 3)]
            return Understanding(
                summary=str(out.get("summary", "")).strip() or idea[:200],
                industry=str(out.get("industry", "")).strip()[:60],
                features=strs("features", 6), search_terms=strs("search_terms", 15),
                cpc_hints=[c for c in cpc if re.fullmatch(r"[A-HY]\d{2}[A-Z]\d*", c)],
                in_dataset=out.get("in_dataset") is not False, source="llm")
    return Understanding(summary=idea[:200], industry="", features=[], search_terms=[], cpc_hints=[], source="none")


def expanded_query(idea: str, u: Understanding) -> str:
    return " ".join([idea, *u.features, *u.search_terms])
