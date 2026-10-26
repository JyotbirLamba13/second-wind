"""Repeatable recall@k benchmark against examiner-cited art.

Input JSONL rows: {"id", "text", "cpc": [...], "examiner_cited": ["<patent id>", ...]}.
Cited ids missing from the index are ignored, so recall is measured on what the corpus can find.
"""
from __future__ import annotations

import json
from statistics import mean

from .retrieval import Index

TARGETS = {"recall@50": 0.60, "recall@10": 0.35, "beat_best_baseline_recall@50": 0.15}
BASELINES = ("bm25", "cpc", "embedding")


def load_benchmark(path: str) -> list[dict]:
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def run_benchmark(index: Index, rows: list[dict], ks: list[int]) -> dict:
    results: dict[str, dict[str, float]] = {}
    usable = [r for r in rows if set(r["examiner_cited"]) & set(index.ids)]
    for mode in Index.METHODS:
        per_k = {k: [] for k in ks}
        for r in usable:
            gold = set(r["examiner_cited"]) & set(index.ids)
            hits = index.search(r["text"], k=max(ks), mode=mode, cpc_hints=r.get("cpc"))
            ranked = [h.id for h in hits]
            for k in ks:
                per_k[k].append(len(gold & set(ranked[:k])) / len(gold))
        results[mode] = {f"recall@{k}": round(mean(v), 4) if v else 0.0 for k, v in per_k.items()}
    out = {"applications": len(usable), "corpus_size": len(index.ids), "ks": ks, "results": results}
    big = f"recall@{max(ks)}"
    best_base = max(results[b][big] for b in BASELINES)
    out["best_baseline"] = {"method": max(BASELINES, key=lambda b: results[b][big]), big: best_base}
    out["hybrid_vs_best_baseline"] = round(results["hybrid"][big] - best_base, 4)
    out["targets"] = TARGETS
    out["note"] = ("Targets assume the 300-application benchmark in the PRD. Small corpora saturate recall, "
                   "so treat sample-data results as a smoke test only.")
    return out
