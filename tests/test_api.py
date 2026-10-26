import os
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.patents import Patent, legal_status


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db = str(tmp_path_factory.mktemp("db") / "t.db")
    s = Settings(db_path=db, anthropic_key="", openrouter_key="")  # tests never call an LLM
    with TestClient(create_app(s)) as c:
        yield c


def _p(**kw):
    base = dict(id="X", title="t", abstract="a", filing_date="2010-01-01", grant_date="2012-01-01")
    return Patent(**{**base, **kw})


def test_status_lapsed_expired_in_force():
    today = date(2026, 10, 26)
    lapsed = _p(maintenance=[{"year": 3.5, "paid": False}])
    assert legal_status(lapsed, today).status == "lapsed"
    assert "3.5-year" in legal_status(lapsed, today).lapse_reason
    expired = _p(filing_date="2005-01-01", grant_date="2007-01-01",
                 maintenance=[{"year": 3.5, "paid": True}, {"year": 7.5, "paid": True}, {"year": 11.5, "paid": True}])
    assert legal_status(expired, today).status == "expired"
    assert legal_status(_p(filing_date="2024-01-01", grant_date="2025-06-01"), today).status == "in_force"


def test_unpaid_inside_grace_window_still_in_force():
    p = _p(filing_date="2022-01-01", grant_date="2023-01-01")  # 3.5y fee window runs to 2027-01
    assert legal_status(p, date(2026, 10, 26)).status == "in_force"


def test_health_and_stats(client):
    assert client.get("/health").json()["patents"] == 16
    by = client.get("/v1/stats").json()["by_status"]
    assert by["lapsed"] > 0 and by["expired"] > 0 and by["in_force"] > 0


def test_patent_endpoints(client):
    assert client.get("/v1/patents/SL-S001").json()["status"] == "lapsed"
    assert client.get("/v1/patents/NOPE").status_code == 404
    assert all(p["status"] == "lapsed" for p in client.get("/v1/patents?status=lapsed&cpc=A47J").json())


def test_search_finds_relevant(client):
    r = client.post("/v1/search", json={"query": "water bottle that tracks how much you drink", "k": 3}).json()
    assert r[0]["patent"]["id"] in {"SL-S002", "SL-S008"}
    only = client.post("/v1/search", json={"query": "cold brew coffee pump", "status": ["lapsed"]}).json()
    assert all(h["patent"]["status"] == "lapsed" for h in only)


def test_scout_ranks_and_explains(client):
    r = client.post("/v1/scout", json={"cpc_prefixes": ["A47J"], "limit": 5}).json()
    assert r and [o["rank"] for o in r] == list(range(1, len(r) + 1))
    assert all(o["patent"]["status"] != "in_force" for o in r)
    assert r == sorted(r, key=lambda o: -o["score"])
    assert all(o["why_ranked"] and o["why_lapsed"] and o["citations"] for o in r)


IDEA_BLOCKED = ("A cold brew coffee system with a vessel holding coffee grounds in chilled water and an ultrasonic "
                "transducer coupled to the vessel that excites the slurry to speed extraction")


def test_check_red_with_blocker_and_citations(client):
    r = client.post("/v1/check", json={"idea": IDEA_BLOCKED}).json()
    assert r["triage"] == "red" and r["attorney_handoff"]
    assert r["blockers"][0]["patent"]["id"] == "SL-S007"
    assert all(c["citations"] for c in r["claims"] if "No patent" not in c["text"])
    assert r["riskiest_assumption"]["two_week_test"].startswith("Week 1")
    assert "not a legal opinion" in r["disclaimer"]


def test_check_green_for_unrelated_idea(client):
    r = client.post("/v1/check", json={"idea": "An underwater drone that photographs coral reefs and maps temperature"}).json()
    assert r["triage"] == "green" and not r["blockers"]


def test_report_roundtrip_and_packet(client):
    rid = client.post("/v1/check", json={"idea": IDEA_BLOCKED}).json()["id"]
    assert client.get(f"/v1/reports/{rid}").json()["id"] == rid
    md = client.get(f"/v1/reports/{rid}/packet")
    assert md.status_code == 200 and "SL-S007" in md.text and md.headers["content-type"].startswith("text/markdown")
    assert client.get("/v1/reports/missing").status_code == 404


def test_benchmark(client):
    r = client.post("/v1/benchmark/run", json={"ks": [3, 10]}).json()
    assert r["applications"] == 6 and set(r["results"]) == {"bm25", "embedding", "cpc", "hybrid"}
    assert r["results"]["hybrid"]["recall@10"] >= 0.8


def test_check_lay_wording_flags_in_force_blocker(client):
    r = client.post("/v1/check", json={"idea": "A bottle that senses how much water I drink and reminds me through a phone app"}).json()
    assert r["triage"] in {"yellow", "red"}
    assert "SL-S008" in [b["patent"]["id"] for b in r["blockers"]]


def test_gibberish_query_returns_nothing(client):
    assert client.post("/v1/search", json={"query": "zzzz qqqq"}).json() == []
