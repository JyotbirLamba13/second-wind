# Second Wind

Built on the open [bistvinayak/second-life](https://github.com/bistvinayak/second-life) backend (originally named Second Life), which this repo merges in automatically.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bistvinayak/second-life)

## Try the demo

```bash
git clone https://github.com/bistvinayak/second-life && cd second-life
pip install -r requirements.txt
uvicorn app.main:app          # open http://localhost:8000
```

It opens a chat. Describe a product idea and get a patent triage report, then ask follow-up questions or describe a design change and it re-checks.

- **Live example (real data):** coffee and beverage makers, CPC `A47J31`, 5,444 real US utility patents from Google Patents Public Data (`data/coffee_a47j31.jsonl.gz`). Try the cold brew or barcode pod examples.
- **Everything else (mock data):** for an idea outside that industry, the LLM invents a small set of fictional patents on the spot, so you can see the whole product. The report says so in a banner, mock patents are marked `mock` and carry no links. Never rely on those results. The first idea in a new industry takes up to a minute while the mock set is generated, then it is cached.
- **CPC** (Cooperative Patent Classification) is the category code every patent carries, e.g. `A47J31/44` is beverage-making apparatus. The LLM guesses the codes for your idea, and the backend compares them with what the live dataset covers.

**API key:** the LLM features (idea understanding, mock data for other industries, chat follow-ups) need an OpenRouter key. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` (free models only are used by default). On Render, add it as an environment variable. Without a key the app still runs, with weaker idea understanding and no mock data. The app limits each visitor to 12 checks per 10 minutes so a shared key is not drained.

**Deploy a public link:** click the Render button above (free plan, Docker), or `docker build -t second-wind . && docker run -p 8000:8000 second-wind`. Free Render instances sleep when idle and lose saved reports on restart.

Real patent data is from Google Patents Public Data (https://console.cloud.google.com/marketplace/product/google_patents_public_datasets/google-patents-public-data), licensed CC BY 4.0, via BigQuery.

## Web app (Vercel)

`src/` holds a React + Vite frontend: a marketing site and a workspace with Idea check (chat + report), Opportunity scout, and a research mode (patent search with method comparison, corpus browser, patent records, corpus profile, retrieval benchmark) plus saved reports. Every screen states that results are research triage, not legal advice, and the workspace asks for an acknowledgement before first use.

```bash
npm install
uvicorn app.main:app --port 8000   # API
npm run dev                        # http://localhost:5173, proxies /api to :8000
```

On Vercel the same repo deploys both halves: `api/index.py` serves the FastAPI app as a Python function at `/api/*`, and the Vite build is served statically (`vercel.json`). Set `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY`) in the Vercel project's environment variables. Serverless instances don't share disk, so the frontend keeps each report and sends it back with chat follow-ups (`report` in `/v1/chat`) and packet exports (`POST /v1/packet`). Saved reports live in the visitor's browser.

## Backend

REST API for an AI patent research assistant for student and first-time founders. It does research and triage only. It never gives legal opinions and hands off to a registered patent attorney when risk is high.

Two modes share one retrieval core:

- **Scout**: ranks lapsed and expired US consumer-hardware patents by second-wind potential, with reasons.
- **Check**: takes a founder's idea and returns a green/yellow/red novelty and blocking-patent triage, the closest prior art, the single riskiest assumption written as a two-week test, and a downloadable prior-art packet. Every statement carries a link to its source patent.

## UI

A no-build web UI lives in `ui/index.html` and is served by the backend, so one process gives you the whole app: run `uvicorn app.main:app` and open http://localhost:8000. It has a **Check my idea** tab (triage badge, how the AI read the idea, blockers, prior art, riskiest assumption, packet download) and a **Scout opportunities** tab. Everything calls the same `/v1/*` API, so the UI can be swapped for any framework without backend changes. If `data/patents.jsonl` exists the server uses it, otherwise it falls back to the synthetic sample.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest -q
python -m scripts.benchmark        # recall@k vs examiner-cited art
```

Or `docker build -t second-wind . && docker run -p 8000:8000 second-wind`.

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
- **LLM (optional)**: set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODELS` (comma-separated fallback chain, default all free: Nemotron 3 Ultra, Gemma 4 31B, then the OpenRouter free router)) in `.env`, or `ANTHROPIC_API_KEY`. If the call fails, for example with no credits, the deterministic text is used. With a key set, the riskiest-assumption text is rewritten by the model, restricted to patent ids already found. Without a key, deterministic templates are used and everything works.

## AI guardrails

`app/agents/guard.py` checks everything the model writes before it reaches a user; failures fall back to rule-based text built from the report.

- Scoring is conservative: each patent is scored on the founder's raw words and on the model-expanded query, and the higher overlap counts, so model wording can raise a result but never lower it. Raw-idea search results are merged in too.
- An idea whose raw words match the live corpus strongly (`live_override`) stays on live data even if the model calls it out of domain.
- Idea summaries and features must stay within the founder's wording (`novel_ratio`).
- Chat answers and assumption rewrites may only name patent ids in the report and only use percentages and years from it; legal conclusions ("won't infringe", "patentable", "safe to sell", "guarantee") are rejected. Assumption rewrites must keep the cited patent.
- Revised ideas from design changes must stay close to the original idea plus the founder's message, otherwise the founder's own words are used.
- Legal-topic questions always get an attorney pointer; answers on mock data are labelled. Responses carry `source: ai | rules` and `ai_written` so the UI can label them.
- Prompts tell the model to treat user text as data, not instructions.

## Real data (Google Patents on BigQuery)

`scripts/load_bigquery.py` pulls US utility patents for a CPC prefix from Google Patents Public Data into the JSONL format. BigQuery bills whole columns, so a pull costs about 170 GB of scan no matter how narrow the CPC (check with `--dry-run` first; the free tier is 1 TB a month). Run it once, then serve the file.

```bash
gcloud auth application-default login
python -m scripts.load_bigquery --project YOUR_PROJECT --cpc A47J31 --dry-run
python -m scripts.load_bigquery --project YOUR_PROJECT --cpc A47J31 --max-gb 200 --out data/patents.jsonl
SECOND_LIFE_DATA=data/patents.jsonl uvicorn app.main:app
```

The prototype uses A47J31 (coffee makers): 5,444 patents. The file is not committed. Google's dataset has no maintenance fee data, so `maintenance` is null, patents are `in_force` unless past the 20-year term, and responses carry `fee_data: false` to say the status is assumed. Scout can only surface expired patents until fee data is added.

## Data (synthetic sample)

The bundled `data/sample_patents.jsonl` is **synthetic** (ids `SL-S###`, `synthetic: true`) so the API runs out of the box. It is not real patent data. To serve real data, build a JSONL matching `app.patents.Patent` from public USPTO sources (grants, citations, CPC, maintenance fee events), validate with `python -m scripts.ingest file.jsonl`, and set `SECOND_LIFE_DATA`.

The benchmark file format is JSONL rows `{"id", "text", "cpc", "examiner_cited": [patent ids]}`. The bundled sample has 6 rows and saturates recall, so it is only a smoke test. The PRD targets (recall@50 of 60% or higher, recall@10 of 35% or higher, +15 points over the best baseline) need the 300-application set on a real corpus.

## Known limits

- Lexical and hashed-embedding retrieval handles lay wording only through a small synonym map. Swap in a neural embedder (same `fit`/`encode` interface in `HashEmbedder`) for production.
- Reports are stored in SQLite and there are no user accounts or billing, matching v1 scope.
- Not legal advice. Reports say so and recommend an attorney when an in-force patent overlaps.
