from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

Level = Literal["green", "yellow", "red"]


class Citation(BaseModel):
    patent_id: str
    url: str
    field: str = Field(description="Where in the source the statement comes from, e.g. 'claim 1'")


class PatentSummary(BaseModel):
    id: str
    title: str
    abstract: str
    cpc: list[str]
    assignee: Optional[str]
    filing_date: date
    grant_date: date
    status: Literal["in_force", "lapsed", "expired"]
    expiry_date: date
    lapse_date: Optional[date] = None
    lapse_reason: Optional[str] = None
    fee_data: bool = Field(True, description="False means in_force is assumed because no maintenance fee data is loaded")
    cited_by_count: int
    url: str
    synthetic: bool = False
    mock: bool = False


class SearchRequest(BaseModel):
    query: str = Field(min_length=3)
    k: int = Field(10, ge=1, le=100)
    mode: Literal["bm25", "embedding", "cpc", "hybrid"] = "hybrid"
    cpc_hints: Optional[list[str]] = None
    status: Optional[list[Literal["in_force", "lapsed", "expired"]]] = None


class SearchHit(BaseModel):
    patent: PatentSummary
    score: float
    components: dict[str, float]


class ScoutRequest(BaseModel):
    cpc_prefixes: Optional[list[str]] = Field(None, description="e.g. ['A47J', 'A63B']; omit for all")
    limit: int = Field(20, ge=1, le=100)
    statuses: list[Literal["lapsed", "expired"]] = ["lapsed", "expired"]


class ScoutChanged(BaseModel):
    years_since_lapse: float
    newer_patents_in_class: int
    possible_blockers: list[PatentSummary]


class Opportunity(BaseModel):
    rank: int
    patent: PatentSummary
    score: float = Field(description="0-100 second-life potential")
    components: dict[str, float]
    why_ranked: list[str]
    why_lapsed: str
    what_changed: ScoutChanged
    citations: list[Citation]


class Understanding(BaseModel):
    summary: str
    features: list[str]
    search_terms: list[str]
    industry: str = ""
    in_dataset: bool = True
    cpc_hints: list[str]
    source: Literal["llm", "none"] = Field(description="'none' means the LLM was unavailable and the raw idea was used")


class CheckRequest(BaseModel):
    idea: str = Field(min_length=20, description="Plain-language description of the product or invention")
    cpc_hints: Optional[list[str]] = None
    use_llm: bool = True


class PriorArtItem(BaseModel):
    patent: PatentSummary
    similarity: float
    claim_coverage: float
    matched_terms: list[str]
    why: str


class Blocker(BaseModel):
    patent: PatentSummary
    claim_coverage: float
    matched_terms: list[str]
    unmatched_distinctive_terms: list[str]
    level: Level
    why: str


class Assumption(BaseModel):
    assumption: str
    two_week_test: str
    citations: list[Citation]


class ReportClaim(BaseModel):
    text: str
    citations: list[Citation]


class CheckReport(BaseModel):
    id: str
    kind: Literal["check"] = "check"
    created_at: str
    idea: str
    understanding: Understanding
    data_mode: Literal["live", "mock"] = "live"
    data_note: str = ""
    triage: Level
    novelty_level: Level
    blocking_level: Level
    summary: str
    claims: list[ReportClaim]
    prior_art: list[PriorArtItem]
    blockers: list[Blocker]
    riskiest_assumption: Assumption
    attorney_handoff: bool
    attorney_handoff_reason: str
    metrics: dict[str, float]
    disclaimer: str


class BenchmarkRequest(BaseModel):
    ks: list[int] = [10, 50]
    path: Optional[str] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    report_id: Optional[str] = Field(None, description="Report from the previous turn, for follow-up questions")


class ChatResponse(BaseModel):
    action: Literal["check", "answer", "recheck", "ask"]
    reply: str
    report: Optional[CheckReport] = None
