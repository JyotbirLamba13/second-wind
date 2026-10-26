"""Export a prior-art packet as Markdown for an IP clinic or attorney."""
from __future__ import annotations

from .schemas import CheckReport


def packet_markdown(r: CheckReport) -> str:
    L = [f"# Prior-art packet {r.id}", f"Generated {r.created_at}", "", f"> {r.disclaimer}", "",
         "## Idea", r.idea, "", f"## Triage: **{r.triage.upper()}**",
         f"- Novelty: {r.novelty_level}", f"- Blocking patents: {r.blocking_level}", "", r.summary, "",
         "## Findings"]
    for c in r.claims:
        refs = ", ".join(f"[{x.patent_id} ({x.field})]({x.url})" for x in c.citations)
        L.append(f"- {c.text} {refs}".rstrip())
    L += ["", "## Possible blocking patents"]
    L += [f"- [{b.patent.id}]({b.patent.url}) {b.patent.title}, in force until {b.patent.expiry_date}, "
          f"{b.level}, coverage {b.claim_coverage:.0%}" for b in r.blockers] or ["- None above threshold"]
    L += ["", "## Closest prior art"]
    L += [f"- [{a.patent.id}]({a.patent.url}) {a.patent.title} ({a.patent.status.replace('_', ' ')}), "
          f"claim coverage {a.claim_coverage:.0%}, terms: {', '.join(a.matched_terms)}" for a in r.prior_art]
    ra = r.riskiest_assumption
    L += ["", "## Riskiest assumption", f"**{ra.assumption}**", "", f"Two-week test: {ra.two_week_test}", "",
          "## Attorney handoff", f"{'Recommended. ' if r.attorney_handoff else 'Not triggered. '}{r.attorney_handoff_reason}"]
    return "\n".join(L) + "\n"
