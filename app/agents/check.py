"""Check mode: idea in, novelty and blocking-patent triage report out."""
from __future__ import annotations

import html
import json
import time
import uuid
from datetime import datetime, timezone

from ..config import Settings
from ..schemas import (
    Assumption, Blocker, Citation, CheckReport, CheckRequest, Level, PriorArtItem, ReportClaim,
)
from ..retrieval import tokenize
from ..store import PatentStore
from .common import summarize
from .guard import check_text
from .llm import LLM
from .mock import in_live_domain, mock_store
from .understand import expanded_query, understand_idea

DISCLAIMER = (
    "This is automated first-pass research, not a legal opinion on patentability or freedom to operate. "
    "Consult a registered patent attorney before relying on it."
)
_RANK = {"green": 0, "yellow": 1, "red": 2}



def _name(p) -> str:
    """A patent as people read it: its title first, the number after."""
    return f"{html.unescape(p.title).strip()} ({p.id})" if p.title else p.id

def _level(v: float, yellow: float, red: float) -> Level:
    return "red" if v >= red else "yellow" if v >= yellow else "green"


def _cite(store: PatentStore, pid: str, field: str = "claim 1") -> Citation:
    return Citation(patent_id=pid, url=store.patents[pid].source_url, field=field)


def run_check(req: CheckRequest, store: PatentStore, settings: Settings, llm: LLM) -> CheckReport:
    t0 = time.perf_counter()
    understanding = understand_idea(req.idea, llm if req.use_llm else None, settings.live_domain if store.live_subclasses else "")
    data_mode, data_note = "live", ""
    # The idea's own words, searched without any model help. The model can widen the search, never narrow it.
    raw_hits = store.index.search(req.idea, k=25, mode="hybrid", cpc_hints=req.cpc_hints)
    live_match = max((store.index.idea_coverage(h.id, req.idea) for h in raw_hits[:10]), default=0.0)
    if not in_live_domain(understanding, store) and live_match >= settings.live_override:
        data_note = ("The AI placed this idea outside the live dataset, but its own words match live patents closely, "
                     "so real data is used.")
    elif not in_live_domain(understanding, store):
        mock = mock_store(req.idea, understanding, store, llm if req.use_llm else None)
        if mock:
            store, data_mode = mock, "mock"
            data_note = (f"Your idea is in {understanding.industry or 'an industry'} that is not in the live dataset ("
                         f"{settings.live_domain}). These results use AI-generated mock patents to demo the product. Do not rely on them.")
        else:
            data_note = ("Your idea looks outside the live dataset (" + settings.live_domain + "), and mock demo data could not be "
                         "generated. Results below are weak matches.")
    idx = store.index
    query = expanded_query(req.idea, understanding)
    cpc_hints = req.cpc_hints or understanding.cpc_hints or None
    hits = idx.search(query, k=25, mode="hybrid", cpc_hints=cpc_hints)
    if data_mode == "live" and query != req.idea:
        seen = {h.id for h in hits}
        hits += [h for h in raw_hits if h.id not in seen]

    prior_art, blockers = [], []
    for h in hits:
        claim_cov, matched = idx.claim_coverage(h.id, query)
        # Conservative: the worse of the founder's words and the model's reading, so model wording can't hide overlap.
        cov = max(claim_cov, idx.idea_coverage(h.id, query), idx.idea_coverage(h.id, req.idea))
        if cov < 0.15:
            continue
        st = store.status[h.id].status
        similarity = h.components.get("embedding", 0.0)
        p = store.patents[h.id]
        summ = summarize(p, store.status[h.id])
        prior_art.append(PriorArtItem(
            patent=summ, similarity=round(similarity, 3), claim_coverage=round(cov, 3), matched_terms=list(dict.fromkeys(idx.surface(t) for t in matched))[:8],
            why=f"Overlap {cov:.0%}: claim 1 shares {claim_cov:.0%} of its terms with the idea ({st.replace('_', ' ')})."))
        if st == "in_force":
            lvl = _level(cov, settings.blocking_yellow, settings.blocking_red)
            if lvl != "green":
                claim_terms = set(tokenize(p.claims[0] if p.claims else p.abstract))
                missing = sorted(claim_terms - set(matched), key=lambda t: -idx.idf.get(t, 0))[:6]
                blockers.append(Blocker(
                    patent=summ, claim_coverage=round(cov, 3), matched_terms=[idx.surface(t) for t in matched[:8]],
                    unmatched_distinctive_terms=[idx.surface(t) for t in missing], level=lvl,
                    why=(f"In force until {summ.expiry_date}. The idea reads on {cov:.0%} of claim 1's terms; "
                         f"a design that avoids elements like {', '.join(missing[:3]) or 'its limitations'} may sit outside it.")))
    prior_art.sort(key=lambda x: -x.claim_coverage)
    blockers.sort(key=lambda x: -x.claim_coverage)
    prior_art = prior_art[:10]

    top_cov = prior_art[0].claim_coverage if prior_art else 0.0
    novelty = _level(top_cov, settings.novelty_yellow, settings.novelty_red)
    blocking: Level = max((b.level for b in blockers), key=_RANK.get, default="green")
    triage: Level = max((novelty, blocking), key=_RANK.get)

    claims: list[ReportClaim] = []
    if prior_art:
        a = prior_art[0]
        claims.append(ReportClaim(
            text=f"Closest prior art is {_name(a.patent)}, {a.patent.status.replace('_', ' ')}, "
                 f"overlapping {a.claim_coverage:.0%} of claim 1 terms.",
            citations=[_cite(store, a.patent.id)]))
    else:
        claims.append(ReportClaim(text="No patent in the indexed corpus overlaps the idea meaningfully.", citations=[]))
    for b in blockers[:3]:
        claims.append(ReportClaim(
            text=f"{_name(b.patent)} is in force until {b.patent.expiry_date} and may block ({b.level}).",
            citations=[_cite(store, b.patent.id)]))
    free = [a for a in prior_art if a.patent.status != "in_force" and a.claim_coverage >= settings.novelty_yellow]
    for a in free[:2]:
        claims.append(ReportClaim(
            text=f"{_name(a.patent)} is {a.patent.status.replace('_', ' ')}, so its own claims no longer block anyone, though in-force patents may still cover "
                 f"the same design; it also counts against novelty of the same features.",
            citations=[_cite(store, a.patent.id)]))

    assumption = _assumption(req, store, blockers, prior_art, novelty, llm if req.use_llm else None)

    handoff = triage == "red" or any(b.level != "green" for b in blockers)
    handoff_reason = (
        "An in-force patent overlaps your idea; a registered patent attorney should review the claims before you invest."
        if handoff else "No in-force patent crossed the blocking threshold, but this search covers only the indexed corpus.")
    summary = {
        "green": "No close prior art or blocking patents found in the indexed corpus.",
        "yellow": "Some overlap found. Keep going, but resolve the flagged items first.",
        "red": "Strong overlap with existing patents. Do not invest further before an attorney reviews the cited claims.",
    }[triage]

    return CheckReport(
        id=uuid.uuid4().hex[:12], created_at=datetime.now(timezone.utc).isoformat(), idea=req.idea, understanding=understanding, data_mode=data_mode, data_note=data_note,
        triage=triage, novelty_level=novelty, blocking_level=blocking, summary=summary, claims=claims,
        prior_art=prior_art, blockers=blockers, riskiest_assumption=assumption,
        attorney_handoff=handoff, attorney_handoff_reason=handoff_reason,
        metrics={"runtime_ms": round((time.perf_counter() - t0) * 1000, 1),
                 "llm_input_tokens": llm.input_tokens, "llm_output_tokens": llm.output_tokens},
        disclaimer=DISCLAIMER)


def _assumption(req, store, blockers, prior_art, novelty, llm) -> Assumption:
    if blockers:
        b = blockers[0]
        pid = b.patent.id
        drop = ", ".join(b.unmatched_distinctive_terms[:3]) or "its key limitations"
        base = Assumption(
            assumption=f"Our design avoids at least one element of claim 1 of {pid} ({drop}).",
            two_week_test=(f"Week 1: build a claim chart mapping every element of claim 1 of {pid} to your design. "
                           f"Week 2: have a patent attorney or law clinic review the chart, and prototype a design variant "
                           f"that removes the element you rely on."),
            citations=[_cite(store, pid)])
    elif prior_art and novelty != "green":
        a = prior_art[0]
        pid = a.patent.id
        base = Assumption(
            assumption=f"Our differentiator is not already disclosed by {pid} or its family.",
            two_week_test=(f"Week 1: list your three most novel features and look for each in the full text of {pid} and its "
                           f"continuations. Week 2: show five target customers your product next to {pid}'s embodiment and "
                           f"check whether they see a difference they would pay for."),
            citations=[_cite(store, pid)])
    else:
        base = Assumption(
            assumption="No relevant prior art exists outside this corpus (other technology areas, non-US patents, products).",
            two_week_test=("Week 1: search Google Patents and product listings for your two core features using five synonyms each. "
                           "Week 2: interview three domain experts and ask what already does this."),
            citations=[])
    if llm and llm.enabled and base.citations:
        ids = [c.patent_id for c in base.citations]
        ev = {"idea": req.idea, "draft": base.model_dump(), "allowed_patent_ids": ids}
        out = llm.json_call(
            "Rewrite the riskiest assumption and two-week test in plainer words so a first-time founder or inventor can act on them. "
            "Keys: assumption, two_week_test. Keep the same meaning as the draft: same patent, same claim elements, same direction. "
            "Name the patent id from allowed_patent_ids in the assumption and mention no other patent. Add no new facts, numbers or dates.",
            json.dumps(ev, default=str))
        if out:
            a, t = out.get("assumption"), out.get("two_week_test")
            sources = [base.assumption, base.two_week_test, req.idea]
            context = " ".join(sources)
            bad = (check_text(a, allowed_ids=ids, context=context, max_len=400, must_mention=ids[:1], sources=sources, max_novel=0.6)
                   or check_text(t, allowed_ids=ids, context=context, max_len=900, sources=sources, max_novel=0.7))
            if not bad:
                base = base.model_copy(update={"assumption": a.strip(), "two_week_test": t.strip(), "ai_written": True})
    return base
