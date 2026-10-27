# Second Wind

First-pass patent research for founders, inventors and the programs that back them. Describe a product idea in plain words and Second Wind shows how new it looks, which in-force patents could block it, and which expired patents are open to build on, then hands you a report to take to a patent attorney.

**Live demo:** https://second-wind-patents.vercel.app

> **Not legal advice.** Second Wind is automated first-layer research over a limited corpus. It never says whether an idea is patentable, whether a product infringes, or whether there is freedom to operate. Every report says so and points to a registered patent attorney.

Built on the open [bistvinayak/second-life](https://github.com/bistvinayak/second-life) backend (originally named Second Life), which this repo merges in automatically every 30 minutes (`.github/workflows/sync-upstream.yml`).

## What it does

| Feature | What you get |
|---|---|
| **Idea check** | Chat in plain words. Get green, yellow or red for novelty and for blocking risk, possible blocking patents with the claim elements your idea avoids, the closest prior art, and the riskiest assumption written as a two-week test. Ask follow-ups or describe a design change and it re-checks. Every finding links to the patent and claim it came from. |
| **Report for your patent attorney** | A Word file (.docx), titled "Prior-art packet" as attorneys expect, with the result, findings, blocking patents, prior art and links to the USPTO practitioner roster, pro bono program and law-school clinics. |
| **Patent expiry** | One search box for patents expiring soon or recently expired around your idea, or a lookup by patent number. |
| **Opportunity scout** | Expired patents ranked 0–100 by how promising they are to build on, with reasons and the similar in-force patents to check first. |
| **Research workspace** | Patent search with four ranking methods side by side, full patent records with claims, and a profile of what the corpus covers. |
| **AI switch** | AI reads ideas and answers follow-ups, checked by deterministic guardrails (below). Switch it off in the workspace and nothing is sent to a model. |

The live corpus is 5,444 real US utility patents in CPC A47J31 (coffee and beverage makers) from Google Patents Public Data (CC BY 4.0). Ideas from other industries run on clearly labeled mock patents so the workflow can be shown; those results must never be relied on.

## Run it locally

Needs Python 3.9+ and Node 20+.

```bash
git clone https://github.com/JyotbirLamba13/second-wind && cd second-wind
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
npm install
uvicorn app.main:app --port 8000   # API, docs at http://localhost:8000/docs
npm run dev                        # web app at http://localhost:5173 (proxies /api to :8000)
```

Checks:

```bash
pytest -q          # 35 backend tests, including adversarial guardrail tests
npm run build      # type-checks and builds the web app
```

AI is optional. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` to turn it on. Without a key everything runs on Second Wind's own search and scoring, with weaker idea reading and no mock data for other industries.

## Data and privacy

- **No accounts.** Saved reports live in the visitor's browser. The server keeps a temporary working copy (SQLite in `/tmp` on Vercel) that is cleared when the instance restarts.
- **AI off means no model.** With the workspace switch off, `/v1/chat` gets `use_llm: false` and neither the check nor the follow-ups call a model (covered by `test_ai_off_keeps_every_turn_away_from_the_model`).
- **AI on: idea text goes to OpenRouter.** The default models are OpenRouter free models (`OPENROUTER_MODELS`). **Providers of free models may log prompts or use them for training**, so the site tells visitors to switch AI off for confidential ideas. OpenRouter can restrict routing to providers that don't collect data (`provider.data_collection: "deny"`), but some free models may then be unavailable; it is not enabled yet and should be before any real customer use, along with a paid model whose provider doesn't train on inputs.
- **Rate limit.** Each visitor gets 12 checks per 10 minutes (`RATE_LIMIT_PER_10MIN`) so a shared key isn't drained.
- **Keys** live in environment variables only, never in the repo.

## Repo layout

| Path | What it is |
|---|---|
| `app/` | FastAPI backend: retrieval, check, scout, chat and the AI guardrails (`app/agents/guard.py`) |
| `api/index.py` | Vercel entry point that serves the FastAPI app at `/api/*` |
| `src/` | React + Vite web app: marketing site and workspace |
| `tests/` | Backend tests |
| `data/` | Live corpus (`coffee_a47j31.jsonl.gz`) and the synthetic sample |
| `scripts/` | Data loading (BigQuery), validation and the retrieval benchmark |
| `ui/index.html` | The upstream no-build UI, still served by the backend at `/` |

## Deploy

On Vercel the repo deploys both halves: `api/index.py` runs the API as a Python function at `/api/*`, and the Vite build is served statically (`vercel.json`). Set `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY`) in the project's environment variables. Serverless instances don't share disk, so the web app sends each report back with chat follow-ups (`report` in `/v1/chat`) and exports (`POST /v1/packet`).

The API alone also runs in Docker: `docker build -t second-wind . && docker run -p 8000:8000 second-wind`.

## Backend

REST API for an AI patent research assistant for student and first-time founders. It does research and triage only. It never gives legal opinions and hands off to a registered patent attorney when risk is high.

Two modes share one retrieval core:

- **Scout**: ranks lapsed and expired US patents by second-wind potential, with reasons.
- **Check**: takes a founder's idea and returns a green/yellow/red novelty and blocking-patent triage, the closest prior art, the single riskiest assumption written as a two-week test, and a downloadable prior-art packet. Every statement carries a link to its source patent.

Interactive docs and the OpenAPI schema (`/openapi.json`) are generated. CORS is open by default; restrict it with `CORS_ORIGINS`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/v1/stats` | Liveness, corpus counts by legal status and the live domain |
| GET | `/v1/corpus/profile` | Filings by year, top CPC groups and assignees, next patents to expire |
| GET | `/v1/patents` | List/filter by `status`, `cpc` prefix, `expires_after`/`expires_before`, `sort=expiry` or `-expiry`, paging |
| GET | `/v1/patents/{id}` | Full record with claims |
| POST | `/v1/search` | `bm25`, `embedding`, `cpc` or `hybrid` search, optional status filter |
| POST | `/v1/scout` | Ranked lapsed/expired opportunities (`cpc_prefixes`, `limit`, `statuses`) |
| POST | `/v1/check` | Run triage on `{ "idea": "..." }`; returns and stores a report |
| POST | `/v1/chat` | Conversational check: first message runs a check, later ones answer or re-check (`use_llm: false` keeps it off the model) |
| GET | `/v1/reports`, `/v1/reports/{id}` | Stored reports |
| GET | `/v1/reports/{id}/packet` | Prior-art packet as Markdown for an IP clinic |
| POST | `/v1/packet` | The same packet, built from a report the client sends |
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
- Legal status is estimated from the 20-year term: maintenance-fee data, term adjustments and extensions aren't loaded, so some "in force" patents may have lapsed.
- One CPC class is live; other industries use labeled mock data.
- AI runs on free OpenRouter models whose providers may log prompts (see Data and privacy).
- Not legal advice. Reports say so and recommend an attorney when an in-force patent overlaps.
