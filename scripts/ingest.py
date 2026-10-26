"""Validate a patent JSONL file against the schema and print a status summary.

python -m scripts.ingest path/to/patents.jsonl

Build the JSONL from public USPTO data (PatentsView grants, citations, CPC; USPTO maintenance fee events).
One JSON object per line, matching app.patents.Patent. Set SECOND_LIFE_DATA to the file to serve it.
"""
import sys
from collections import Counter

from app.store import PatentStore

if len(sys.argv) != 2:
    sys.exit(__doc__)
s = PatentStore(sys.argv[1])
print(f"{len(s.patents)} patents loaded")
print(Counter(st.status for st in s.status.values()))
