from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .agents.chat import handle_chat
from .agents.check import run_check
from .agents.common import summarize
from .agents.llm import LLM
from .agents.scout import run_scout
from .benchmark import load_benchmark, run_benchmark
from .config import Settings, get_settings
from .ratelimit import limit
from .report import packet_markdown
from .schemas import (
    BenchmarkRequest, ChatRequest, ChatResponse, CheckReport, CheckRequest, Opportunity, PatentSummary, ScoutRequest, SearchHit,
    SearchRequest,
)
from .store import PatentStore, ReportDB


UI_DIR = Path(__file__).resolve().parent.parent / "ui"


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = PatentStore(settings.data_path)
        app.state.db = ReportDB(settings.db_path)
        app.state.llm = LLM(settings)
        yield

    app = FastAPI(
        title="Second Life API",
        version="0.1.0",
        description="Patent triage and lapsed-patent opportunity research for founders. Research only, never legal advice.",
        lifespan=lifespan,
    )
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])

    def store() -> PatentStore:
        return app.state.store

    @app.get("/health", tags=["meta"])
    def health():
        return {"status": "ok", "patents": len(store().patents), "llm_enabled": app.state.llm.enabled}

    @app.get("/v1/stats", tags=["meta"])
    def stats():
        s = store()
        counts = {"in_force": 0, "lapsed": 0, "expired": 0}
        for st in s.status.values():
            counts[st.status] += 1
        return {"patents": len(s.patents), "by_status": counts, "as_of": s.today.isoformat(),
                "live_domain": settings.live_domain if s.live_subclasses else "", "live_subclasses": sorted(s.live_subclasses)}

    @app.get("/v1/patents", response_model=list[PatentSummary], tags=["patents"])
    def list_patents(
        status: Optional[str] = Query(None, pattern="^(in_force|lapsed|expired)$"),
        cpc: Optional[str] = Query(None, description="CPC prefix, e.g. A47J"),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
    ):
        s = store()
        out = []
        for i, p in s.patents.items():
            if status and s.status[i].status != status:
                continue
            if cpc and not any(c.replace(" ", "").startswith(cpc) for c in p.cpc):
                continue
            out.append(summarize(p, s.status[i]))
        return out[offset: offset + limit]

    @app.get("/v1/patents/{patent_id}", tags=["patents"])
    def get_patent(patent_id: str):
        s = store()
        p = s.patents.get(patent_id)
        if not p:
            raise HTTPException(404, "patent not found")
        return {**summarize(p, s.status[patent_id]).model_dump(), "claims": p.claims, "cites": p.cites,
                "family_ids": p.family_ids}

    @app.post("/v1/search", response_model=list[SearchHit], tags=["search"])
    def search(req: SearchRequest):
        s = store()
        allow = s.ids_with_status(*req.status) if req.status else None
        hits = s.index.search(req.query, k=req.k, mode=req.mode, cpc_hints=req.cpc_hints, allow=allow)
        return [SearchHit(patent=summarize(s.patents[h.id], s.status[h.id]), score=h.score, components=h.components)
                for h in hits]

    @app.post("/v1/scout", response_model=list[Opportunity], tags=["scout"])
    def scout(req: ScoutRequest):
        return run_scout(req, store(), settings)

    def _run(req: CheckRequest) -> CheckReport:
        report = run_check(req, store(), settings, app.state.llm)
        app.state.db.save(report.id, "check", report.created_at, report.model_dump(mode="json"))
        return report

    @app.post("/v1/check", response_model=CheckReport, tags=["check"], dependencies=[Depends(limit)])
    def check(req: CheckRequest):
        return _run(req)

    @app.post("/v1/chat", response_model=ChatResponse, tags=["chat"], dependencies=[Depends(limit)])
    def chat(req: ChatRequest):
        def load(rid: str):
            body = app.state.db.get(rid)
            if body:
                return CheckReport.model_validate(body)
            return req.report if req.report and req.report.id == rid else None

        return handle_chat(req, load, _run, app.state.llm)

    @app.get("/v1/reports", tags=["check"])
    def list_reports(limit: int = Query(50, ge=1, le=200)):
        return app.state.db.list("check", limit)

    def _load(report_id: str) -> CheckReport:
        body = app.state.db.get(report_id)
        if not body:
            raise HTTPException(404, "report not found")
        return CheckReport.model_validate(body)

    @app.get("/v1/reports/{report_id}", response_model=CheckReport, tags=["check"])
    def get_report(report_id: str):
        return _load(report_id)

    @app.get("/v1/reports/{report_id}/packet", tags=["check"], response_class=Response)
    def packet(report_id: str):
        return Response(packet_markdown(_load(report_id)), media_type="text/markdown")

    @app.post("/v1/packet", tags=["check"], response_class=Response)
    def packet_from_report(report: CheckReport):
        """Same packet as /v1/reports/{id}/packet, built from a report the client already holds."""
        return Response(packet_markdown(report), media_type="text/markdown")

    @app.post("/v1/benchmark/run", tags=["benchmark"])
    def benchmark(req: BenchmarkRequest):
        path = req.path or "data/sample_benchmark.jsonl"
        try:
            rows = load_benchmark(path)
        except FileNotFoundError:
            raise HTTPException(404, f"benchmark file not found: {path}")
        return run_benchmark(store().index, rows, sorted(set(req.ks)))

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/ui/")

    app.mount("/ui", StaticFiles(directory=UI_DIR, html=True), name="ui")
    return app


app = create_app()
