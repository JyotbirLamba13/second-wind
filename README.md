# Second Life backend

REST API for an AI patent research assistant for student and first-time founders. It does research and triage only. It never gives legal opinions and hands off to a registered patent attorney when risk is high.

Two modes share one retrieval core:

- **Scout**: ranks lapsed and expired US consumer-hardware patents by second-life potential, with reasons.
- **Check**: takes a founder's idea and returns a green/yellow/red novelty and blocking-patent triage, the closest prior art, the single riskiest assumption written as a two-week test, and a downloadable prior-art packet. Every statement carries a link to its source patent.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest -q
python -m scripts.benchmark        # recall@k vs examiner-cited art
```

Or `docker build -t second-life . && docker run -p 8000:8000 second-life`.

Interactive docs and the OpenAPI schema (`/openapi.json`) are generated, so the UI team can build typed clients from them. CORS is open by default; restrict it with `CORS_ORIGINS`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/v1/stats` | Liveness, corpus counts by legal status |
| GET | `/v1/patents` | List/filter by `status`, `cpc` prefix, paging |
| GET | `/v1/patents/{id}` | Full record with claims |
| POST | `/v1/search` | `bm25`, `embedding`, `cpc` or `hybrid` search, optional status filter |
| POST | `/v1/scout` | Ranked lapsed/expired opportunities (`cpc_prefixes`, `limit`, `statuses`) |
| POST | `/v1/check` | Run triage on `{ "idea": "..." }`; returns and stores a report |
| GET | `/v1/reports`, `/v1/reports/{id}` | Stored reports |
| GET | `/v1/reports/{id}/packet` | Prior-art packet as Markdown for an IP clinic |
| POST | `/v1/benchmark/run` | Recall@k for all methods vs examiner citations |

Example:

```bash
curl -s localhost:8000/v1/check -H 'content-type: application/json' \
  -d '{"idea":"A cold brew coffee system with an ultrasonic transducer exciting the grounds slurry"}'
```

## How it works

- **Legal status** (`app/patents.py`): derived from maintenance-fee events (due 3.5, 7.5, 11.5 years after grant, 6 month grace) and the 20-year term from filing. A fee unpaid past its window means `lapsed`; reaching term means `expired`.
- **Retrieval** (`app/retrieval.py`): BM25, hashed TF-IDF embeddings, CPC-class matching, and reciprocal-rank-fusion hybrid. All offline, no model downloads.
- **Check** (`app/agents/check.py`): hybrid search, then idf-weighted overlap between the idea and each patent's claim 1 and text. In-force patents above a threshold become possible blockers; overall triage is the worse of novelty and blocking. Thresholds live in `app/config.py`.
- **Scout** (`app/agents/scout.py`): score 0-100 from forward citations (30%), family breadth (15%), clearance from similar in-force patents (30%), and new activity in the class since the lapse (25%).
- **LLM (optional)**: set `ANTHROPIC_API_KEY` and the riskiest-assumption text is rewritten by the model, restricted to patent ids already found. Without a key, deterministic templates are used and everything works.

## Data

The bundled `data/sample_patents.jsonl` is **synthetic** (ids `SL-S###`, `synthetic: true`) so the API runs out of the box. It is not real patent data. To serve real data, build a JSONL matching `app.patents.Patent` from public USPTO sources (grants, citations, CPC, maintenance fee events), validate with `python -m scripts.ingest file.jsonl`, and set `SECOND_LIFE_DATA`.

The benchmark file format is JSONL rows `{"id", "text", "cpc", "examiner_cited": [patent ids]}`. The bundled sample has 6 rows and saturates recall, so it is only a smoke test. The PRD targets (recall@50 of 60% or higher, recall@10 of 35% or higher, +15 points over the best baseline) need the 300-application set on a real corpus.

## Known limits

- Lexical and hashed-embedding retrieval handles lay wording only through a small synonym map. Swap in a neural embedder (same `fit`/`encode` interface in `HashEmbedder`) for production.
- Reports are stored in SQLite and there are no user accounts or billing, matching v1 scope.
- Not legal advice. Reports say so and recommend an attorney when an in-force patent overlaps.
