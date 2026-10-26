"""Scout mode: rank lapsed and expired patents by second-wind potential."""
from __future__ import annotations

import math
from bisect import bisect_right

import numpy as np

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
    in_force = sorted(store.ids_with_status("in_force"))
    max_cites = max(store.patents[i].cited_by_count for i in pool) or 1

    # Vectorised: one matrix product for pool x in-force similarity, and per-class sorted grant dates for activity.
    pool_rows = np.array([idx.row[i] for i in pool])
    if_rows = np.array([idx.row[j] for j in in_force], dtype=int)
    sims = idx.matrix[pool_rows] @ idx.matrix[if_rows].T if len(if_rows) else np.zeros((len(pool), 0))
    class_dates: dict[str, list[int]] = {}
    main = lambda pat: {c.replace(" ", "").split("/")[0] for c in pat.cpc}  # e.g. A47J31 (CPC main group)
    for q in store.patents.values():
        for g in main(q):
            class_dates.setdefault(g, []).append(q.grant_date.toordinal())
    for v in class_dates.values():
        v.sort()
    if_groups = [idx.groups[j] for j in in_force]

    max_newer = max((len(v) for v in class_dates.values()), default=1) or 1
    scored = []
    for n, i in enumerate(pool):
        p, st = store.patents[i], store.status[i]
        ref_date = st.lapse_date or st.expiry_date
        groups = idx.groups[i]
        mgroups = main(p)
        # Newer patents sharing any class (counted per patent in its best class, so no double counting).
        newer_n = max((len(class_dates[g]) - bisect_right(class_dates[g], ref_date.toordinal()) for g in mgroups), default=0)
        close = np.nonzero(sims[n] >= settings.scout_block_cosine)[0]
        blockers = [in_force[k] for k in close if in_force[k] != i and groups & if_groups[k]]
        closest = float(max((sims[n][k] for k in range(len(in_force)) if in_force[k] != i), default=0.0))
        comps = {
            "citations": math.sqrt(p.cited_by_count / max_cites),
            "family": min(len(p.family_ids), 4) / 4,
            "clearance": 1 - min(closest / 0.6, 1.0),  # the more a live patent resembles it, the less clear the space
            "activity": math.log1p(newer_n) / math.log1p(max_newer),
        }
        score = 100 * sum(WEIGHTS[k] * v for k, v in comps.items())
        years = max((store.today - ref_date).days / 365.25, 0)
        reasons = [
            f"Cited by {p.cited_by_count} later patents." if p.cited_by_count else "No citation data or never cited.",
            f"Family of {len(p.family_ids)} filing(s)." if p.family_ids else "No related family filings.",
            (f"{len(blockers)} in-force patent(s) look similar and need a claim check." if blockers
             else "No similar in-force patents found in the corpus."),
            f"{newer_n} newer patent(s) in the same class since it {'lapsed' if st.lapse_date else 'expired'}.",
        ]
        why_lapsed = (f"{st.lapse_reason}; lapsed {st.lapse_date}." if st.lapse_date
                      else f"Reached the 20-year term on {st.expiry_date}.")
        scored.append((score, i, comps, reasons, why_lapsed, years, newer_n, blockers))
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
