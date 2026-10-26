import json

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.config import Settings
from app.main import create_app

IDEA = "A cold brew coffee system with an ultrasonic transducer exciting the grounds slurry in chilled water"
BOTTLE = "A smart water bottle with a level sensor that tracks how much you drink and reminds you through an app"


class FakeLLM:
    """Scripted stand-in for the model, routed by which prompt it is given."""
    enabled = True
    input_tokens = output_tokens = 0
    last_model = "fake"

    def __init__(self):
        self.chat_reply = {"action": "answer", "reply": "SL-S007 is in force until 2038."}
        self.understanding = None  # override the idea-understanding output
        self.rewrite = None  # override the riskiest-assumption rewrite
        self.calls = []

    def json_call(self, system, prompt, max_tokens=700):
        self.calls.append(system[:30])
        if "search patents" in system and self.understanding is not None:
            return self.understanding
        if "Rewrite the riskiest" in system:
            return self.rewrite
        if "search patents" in system:  # idea understanding
            bottle = "water bottle" in prompt
            return {"summary": "A bottle that tracks water" if bottle else "A cold brew maker",
                    "industry": "Smart bottles" if bottle else "Coffee makers", "in_dataset": not bottle,
                    "features": ["sensor"], "search_terms": ["bottle sensor"] if bottle else ["cold brew", "ultrasonic"],
                    "cpc_hints": ["A47G19"] if bottle else ["A47J31"]}
        if "Invent realistic" in system:
            return {"patents": [{"title": f"Smart hydration bottle {n}", "abstract": "Tracks intake.",
                                 "claim1": "A water bottle comprising a level sensor, a processor tracking fluid intake, and a wireless transmitter to an app that reminds the user to drink",
                                 "cpc": ["A47G19/22"], "filing_year": 2015 if n < 5 else 2002,
                                 "status": "in_force" if n < 5 else "expired", "assignee": "HydroCo"} for n in range(1, 7)]}
        if "talking to a first-time" in system:
            return self.chat_reply
        return None


@pytest.fixture()
def demo(tmp_path, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_10MIN", "0")
    rows = [json.loads(l) for l in open("data/sample_patents.jsonl")]
    path = tmp_path / "a47j.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows if any(c.startswith("A47J") for c in r["cpc"])) + "\n")
    app = create_app(Settings(data_path=str(path), db_path=str(tmp_path / "t.db"), anthropic_key="", openrouter_key=""))
    with TestClient(app) as c:
        app.state.llm = FakeLLM()
        yield c, app.state.llm


def chat(c, text, rid=None, history=None):
    msgs = (history or []) + [{"role": "user", "content": text}]
    return c.post("/v1/chat", json={"messages": msgs, "report_id": rid}).json()


def test_short_message_asks_for_idea(demo):
    c, _ = demo
    r = chat(c, "hi")
    assert r["action"] == "ask" and r["report"] is None


def test_idea_in_live_domain_uses_real_data(demo):
    c, _ = demo
    r = chat(c, IDEA)
    assert r["action"] == "check" and r["report"]["data_mode"] == "live"
    assert r["report"]["triage"] == "red" and "Result: Red." in r["reply"]
    assert r["report"]["blockers"][0]["patent"]["url"].startswith("https://patents.google.com/")


def test_out_of_domain_idea_uses_flagged_mock_data(demo):
    c, _ = demo
    r = chat(c, BOTTLE)["report"]
    assert r["data_mode"] == "mock" and "mock" in r["data_note"].lower()
    ids = [a["patent"] for a in r["prior_art"]]
    assert ids and all(p["mock"] and p["id"].startswith("MOCK-") and p["url"] == "" for p in ids)


def test_followup_question_is_answered_from_report(demo):
    c, llm = demo
    first = chat(c, IDEA)
    r = chat(c, "why is that patent a problem?", first["report"]["id"], [{"role": "user", "content": IDEA}])
    assert r["action"] == "answer" and "SL-S007" in r["reply"] and r["report"] is None


def test_followup_works_from_inline_report_when_store_is_empty(demo):
    c, _ = demo
    report = chat(c, IDEA)["report"]
    report["id"] = "not-stored"  # as on a stateless host where another instance saved it
    r = c.post("/v1/chat", json={"messages": [{"role": "user", "content": "why is that patent a problem?"}],
                                 "report_id": "not-stored", "report": report}).json()
    assert r["action"] == "answer" and r["report"] is None


def test_packet_from_inline_report(demo):
    c, _ = demo
    report = chat(c, IDEA)["report"]
    r = c.post("/v1/packet", json=report)
    assert r.status_code == 200 and r.text.startswith(f"# Prior-art packet {report['id']}")


def test_followup_design_change_reruns_check(demo):
    c, llm = demo
    first = chat(c, IDEA)
    llm.chat_reply = {"action": "recheck", "reply": "", "revised_idea": "A cold brew coffee system using a rotating paddle instead of ultrasound to agitate grounds in chilled water"}
    r = chat(c, "what if I use a paddle instead of ultrasound?", first["report"]["id"])
    assert r["action"] == "recheck" and r["report"]["id"] != first["report"]["id"]


def test_rate_limit(demo, monkeypatch):
    c, _ = demo
    monkeypatch.setenv("RATE_LIMIT_PER_10MIN", "2")
    ratelimit._hits.clear()
    codes = [c.post("/v1/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    ratelimit._hits.clear()


# -- guardrails on model output ---------------------------------------------------------------------------------

def followup(c, report, text):
    return c.post("/v1/chat", json={"messages": [{"role": "user", "content": text}], "report_id": report["id"], "report": report}).json()


@pytest.mark.parametrize("bad", [
    "US9999999B2 is the patent that blocks you.",           # a patent that isn't in the report
    "You will not infringe SL-S007 if you change the motor.",  # a legal conclusion
    "SL-S007 overlaps 97% of your idea.",                    # a number the report doesn't hold
    "SL-S007 is in force until 2051.",                       # a date the report doesn't hold
])
def test_answer_failing_guardrails_is_replaced_by_report_facts(demo, bad):
    c, llm = demo
    report = chat(c, IDEA)["report"]
    llm.chat_reply = {"action": "answer", "reply": bad}
    r = followup(c, report, "why is that patent a problem?")
    assert r["action"] == "answer" and r["source"] == "rules"
    assert bad not in r["reply"] and r["reply"].startswith(("The closest possible blocker", report["blockers"][0]["patent"]["id"]))


def test_grounded_answer_passes_and_legal_question_gets_attorney_line(demo):
    c, llm = demo
    report = chat(c, IDEA)["report"]
    r = followup(c, report, "Would I infringe SL-S007?")
    assert r["source"] == "ai" and "SL-S007 is in force until 2038." in r["reply"] and "attorney" in r["reply"]


def test_question_without_model_is_answered_not_rechecked(demo):
    c, llm = demo
    report = chat(c, IDEA)["report"]
    llm.enabled = False
    r = followup(c, report, "Why was the first blocking patent flagged and what would I need to change in the design?")
    assert r["action"] == "answer" and r["report"] is None and r["source"] == "rules"


def test_revised_idea_that_invents_content_falls_back_to_founder_words(demo):
    c, llm = demo
    report = chat(c, IDEA)["report"]
    llm.chat_reply = {"action": "recheck", "reply": "", "revised_idea": "A blockchain-enabled drone fleet that delivers espresso with solar panels and lidar"}
    r = followup(c, report, "what if I use a paddle instead of ultrasound?")
    assert r["action"] == "recheck" and r["report"]["idea"] == f"{IDEA} Change: what if I use a paddle instead of ultrasound?"


def test_assumption_rewrite_must_keep_the_patent_and_meaning(demo):
    c, llm = demo
    llm.rewrite = {"assumption": "Our brewer does not need a pod identifier.", "two_week_test": "Ask five customers."}
    r = chat(c, IDEA)["report"]["riskiest_assumption"]
    assert not r["ai_written"] and r["citations"][0]["patent_id"] in r["assumption"]
    pid = r["citations"][0]["patent_id"]
    llm.rewrite = {"assumption": f"Our design leaves out at least one element of claim 1 of {pid}.",
                   "two_week_test": f"Week 1: map each element of claim 1 of {pid} to your design. Week 2: have an attorney review the chart."}
    r = chat(c, IDEA)["report"]["riskiest_assumption"]
    assert r["ai_written"] and r["assumption"].startswith("Our design leaves out")


def test_invented_summary_and_features_are_dropped(demo):
    c, llm = demo
    llm.understanding = {"summary": "A titanium rocket-powered grinder with blockchain payments", "industry": "Coffee makers",
                         "in_dataset": True, "features": ["blockchain payment module", "ultrasonic transducer"],
                         "search_terms": [], "cpc_hints": ["A47J31"]}
    u = chat(c, IDEA)["report"]["understanding"]
    assert u["summary"] == IDEA[:200] and u["features"] == ["ultrasonic transducer"]


def test_model_vocabulary_cannot_lower_the_result(demo):
    c, llm = demo
    baseline = chat(c, IDEA)["report"]
    llm.understanding = {"summary": "A cold brew maker", "industry": "Coffee makers", "in_dataset": True, "features": [],
                         "search_terms": [f"unrelatedword{i}" for i in range(15)], "cpc_hints": []}
    diluted = chat(c, IDEA)["report"]
    assert diluted["triage"] == baseline["triage"] == "red"


def test_strong_live_match_stays_on_real_data_when_model_says_out_of_domain(tmp_path, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_10MIN", "0")
    rows = [json.loads(l) for l in open("data/sample_patents.jsonl")]
    path = tmp_path / "a47j.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows if any(c.startswith("A47J") for c in r["cpc"])) + "\n")
    app = create_app(Settings(data_path=str(path), db_path=str(tmp_path / "t.db"), anthropic_key="", openrouter_key="", live_override=0.0))
    with TestClient(app) as c:
        app.state.llm = llm = FakeLLM()
        llm.understanding = {"summary": "A cold brew maker", "industry": "Garden tools", "in_dataset": False, "features": [],
                             "search_terms": [], "cpc_hints": ["A01B1"]}
        r = chat(c, IDEA)["report"]
    assert r["data_mode"] == "live" and "real data is used" in r["data_note"]
