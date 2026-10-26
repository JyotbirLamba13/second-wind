"""Scout mode: rank lapsed and expired patents by second-life potential."""
from __future__ import annotations

import math

from ..config import Settings
from ..retrieval import cpc_group
from ..schemas import Citation, Opportunity, ScoutChanged, ScoutRequest
from ..store import PatentStore
from .common import summarize

WEIGHTS = {"citations": 0.30, "family": 0.15, "clearance": 0.30, "activity": 0.25}


def run_scout(req: ScoutRequest, store: PatentStore, settings: Settings) -> list[Opportunity]:
    idx = store.index
    pool = [i for i in store.ids_with_status(*req.statuses)
            if not req.cpc_prefixes or any(c.replace(" ", "").startswith(pf) for pf in req.cpc_prefixes for c in store.patents[i].cpc)]
    if not pool:
        return []
    in_force = store.ids_with_status("in_force")
    max_cites = max(store.patents[i].cited_by_count for i in pool) or 1
    scored = []
    for i in pool:
        p, st = store.patents[i], store.status[i]
        ref_date = st.lapse_date or st.expiry_date
        groups = {cpc_group(c) for c in p.cpc}
        newer = [j for j, q in store.patents.items()
                 if j != i and q.grant_date > ref_date and groups & {cpc_group(c) for c in q.cpc}]
        # An in-force patent that is close to this one and was granted later may still cover the same ground.
        blockers = [j for j in in_force if j != i and groups & idx.groups[j]
                    and idx.cosine(i, j) >= settings.scout_block_cosine]
        comps = {
            "citations": math.sqrt(p.cited_by_count / max_cites),
            "family": min(len(p.family_ids), 4) / 4,
            "clearance": 1 - min(len(blockers), 3) / 3,
            "activity": min(len(newer), 5) / 5,
        }
        score = 100 * sum(WEIGHTS[k] * v for k, v in comps.items())
        years = max((store.today - ref_date).days / 365.25, 0)
        reasons = [
            f"Cited by {p.cited_by_count} later patents." if p.cited_by_count else "Never cited by later patents.",
            f"Family of {len(p.family_ids)} filing(s)." if p.family_ids else "No related family filings.",
            (f"{len(blockers)} in-force patent(s) look similar and need a claim check." if blockers
             else "No similar in-force patents found in the corpus."),
            f"{len(newer)} newer patent(s) in the same class since it {'lapsed' if st.lapse_date else 'expired'}.",
        ]
        why_lapsed = (f"{st.lapse_reason}; lapsed {st.lapse_date}." if st.lapse_date
                      else f"Reached the 20-year term on {st.expiry_date}.")
        scored.append((score, i, comps, reasons, why_lapsed, years, len(newer), blockers))
    scored.sort(key=lambda x: -x[0])
    out = []
    for rank, (score, i, comps, reasons, why, years, n_newer, blockers) in enumerate(scored[: req.limit], 1):
        p = store.patents[i]
        out.append(Opportunity(
            rank=rank, patent=summarize(p, store.status[i]), score=round(score, 1),
            components={k: round(v, 3) for k, v in comps.items()}, why_ranked=reasons, why_lapsed=why,
            what_changed=ScoutChanged(
                years_since_lapse=round(years, 1), newer_patents_in_class=n_newer,
                possible_blockers=[summarize(store.patents[j], store.status[j]) for j in blockers]),
            citations=[Citation(patent_id=i, url=p.source_url, field="record")]
            + [Citation(patent_id=j, url=store.patents[j].source_url, field="possible blocker") for j in blockers]))
    return out
