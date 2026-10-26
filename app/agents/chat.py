"""Conversational layer: a new idea runs Check, a follow-up is answered from the report or triggers a re-check."""
from __future__ import annotations

import json
from typing import Callable, Optional

from ..schemas import CheckReport, CheckRequest, ChatRequest, ChatResponse
from .llm import LLM

SYSTEM = (
    "You are Second Life's patent research assistant talking to a first-time founder or inventor. You are given a patent triage "
    "report and the conversation. Reply with JSON keys: action ('answer' or 'recheck'), reply (2-5 plain sentences), "
    "revised_idea (only for recheck: one standalone description merging the original idea with the founder's change). "
    "Use 'recheck' when the founder describes a change to the design or a different idea. Use 'answer' for questions about the "
    "report. Answer only from the report facts, mention only patent ids that appear in it, never give legal opinions, and "
    "suggest a registered patent attorney for anything about infringement or legal risk."
)


def _context(r: CheckReport) -> dict:
    return {
        "idea": r.idea, "triage": r.triage, "novelty": r.novelty_level, "blocking": r.blocking_level, "summary": r.summary,
        "data_mode": r.data_mode,
        "blockers": [{"id": b.patent.id, "title": b.patent.title, "level": b.level, "overlap": b.claim_coverage,
                      "why": b.why, "expires": str(b.patent.expiry_date)} for b in r.blockers[:5]],
        "prior_art": [{"id": a.patent.id, "title": a.patent.title, "status": a.patent.status, "overlap": a.claim_coverage}
                      for a in r.prior_art[:6]],
        "riskiest_assumption": r.riskiest_assumption.assumption, "attorney_handoff": r.attorney_handoff}


def intro(r: CheckReport) -> str:
    n = len(r.blockers)
    text = (f"I read your idea as: {r.understanding.summary} "
            f"Triage is {r.triage.upper()}: {r.summary} "
            f"I found {n} possible blocking patent{'s' if n != 1 else ''} and {len(r.prior_art)} close prior-art patents. "
            f"Ask me why something was flagged, or tell me how you would change the design and I will re-check.")
    return text + (f" Note: {r.data_note}" if r.data_note else "")


def handle_chat(req: ChatRequest, load_report: Callable[[str], Optional[CheckReport]],
                run: Callable[[CheckRequest], CheckReport], llm: LLM) -> ChatResponse:
    last = req.messages[-1].content.strip()
    prior = load_report(req.report_id) if req.report_id else None
    if prior is None:
        if len(last) < 20:
            return ChatResponse(action="ask", reply="Tell me about your product idea in a sentence or two: what it does and how it works.")
        report = run(CheckRequest(idea=last))
        return ChatResponse(action="check", reply=intro(report), report=report)

    out = None
    if llm.enabled:
        convo = [{"role": m.role, "content": m.content} for m in req.messages[-6:]]
        out = llm.json_call(SYSTEM, json.dumps({"report": _context(prior), "conversation": convo}, default=str), max_tokens=600)
    action = out.get("action") if out else None
    if action == "answer" and isinstance(out.get("reply"), str):
        return ChatResponse(action="answer", reply=out["reply"], report=None)
    if action == "recheck" and isinstance(out.get("revised_idea"), str) and len(out["revised_idea"]) >= 20:
        idea = out["revised_idea"]
    elif len(last) >= 40:  # no usable LLM answer: treat a long message as a design change
        idea = f"{prior.idea} Change: {last}"
    else:
        return ChatResponse(action="ask", reply=("I can explain any patent in the report, or re-check if you describe a change "
                                                 "to your design in a sentence or two."))
    report = run(CheckRequest(idea=idea))
    shift = "" if report.triage == prior.triage else f"Triage moved from {prior.triage.upper()} to {report.triage.upper()}. "
    return ChatResponse(action="recheck", reply=shift + intro(report), report=report)
