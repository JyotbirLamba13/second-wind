"""CLI: python -m scripts.benchmark [--data PATH] [--bench PATH] [--ks 10 50]"""
import argparse
import json

from app.benchmark import load_benchmark, run_benchmark
from app.store import PatentStore

ap = argparse.ArgumentParser()
ap.add_argument("--data", default="data/sample_patents.jsonl")
ap.add_argument("--bench", default="data/sample_benchmark.jsonl")
ap.add_argument("--ks", type=int, nargs="+", default=[10, 50])
a = ap.parse_args()
print(json.dumps(run_benchmark(PatentStore(a.data).index, load_benchmark(a.bench), a.ks), indent=2))
