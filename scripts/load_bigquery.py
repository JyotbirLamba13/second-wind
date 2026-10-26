"""Pull US utility patents from Google Patents Public Data (BigQuery) into the backend's JSONL format.

python -m scripts.load_bigquery --project second-wind-512804 --cpc A47J A63B G04 --dry-run
python -m scripts.load_bigquery --project second-wind-512804 --cpc A47J A63B G04 --limit 5000 --out data/patents.jsonl

Always dry-run first: it prints the bytes the query would scan. The real run refuses to exceed --max-gb.
Maintenance fee events are not in this dataset; join them with scripts/add_maintenance.py afterwards.
Needs: gcloud auth application-default login
"""
import argparse
import json
import re
from datetime import date

from google.cloud import bigquery

QUERY = """
SELECT
  p.publication_number, p.family_id, p.filing_date, p.grant_date,
  (SELECT t.text FROM UNNEST(p.title_localized) t WHERE t.language = 'en' LIMIT 1) AS title,
  {abstract}
  (SELECT c.text FROM UNNEST(p.claims_localized) c WHERE c.language = 'en' LIMIT 1) AS claims,
  ARRAY(SELECT c.code FROM UNNEST(p.cpc) c) AS cpc,
  ARRAY(SELECT x.name FROM UNNEST(p.assignee_harmonized) x) AS assignees,
  {cites}
FROM `patents-public-data.patents.publications` p
WHERE p.country_code = 'US'
  AND p.kind_code IN ('B1', 'B2')
  AND p.grant_date >= 19810101
  AND EXISTS (SELECT 1 FROM UNNEST(p.cpc) c WHERE REGEXP_CONTAINS(c.code, @cpc_re))
LIMIT @limit
"""


ABSTRACT = "(SELECT a.text FROM UNNEST(p.abstract_localized) a WHERE a.language = 'en' LIMIT 1) AS abstract,"
NO_ABSTRACT = "'' AS abstract,"
CITES = "ARRAY(SELECT x.publication_number FROM UNNEST(p.citation) x WHERE x.publication_number != '') AS cites"
NO_CITES = "ARRAY<STRING>[] AS cites"


def to_date(n: int) -> str:
    s = str(n)
    return date(int(s[:4]), int(s[4:6]), int(s[6:8])).isoformat()


def split_claims(text: str) -> list[str]:
    parts = [c.strip() for c in re.split(r"\n\s*(?=\d+\s*[\.\)]\s)", text or "") if c.strip()]
    return parts[:10]


def patent_id(pub: str) -> str:
    return pub.replace("-", "")  # US-9876543-B2 -> US9876543B2, the form Google Patents URLs use


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--cpc", nargs="+", required=True, help="CPC prefixes, e.g. A47J A63B")
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--out", default="data/patents.jsonl")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--with-abstract", action="store_true", help="adds about 90 GB to the scan")
    ap.add_argument("--with-citations", action="store_true", help="adds about 35 GB to the scan")
    ap.add_argument("--max-gb", type=float, default=50.0)
    a = ap.parse_args()

    client = bigquery.Client(project=a.project)
    params = [
        bigquery.ScalarQueryParameter("cpc_re", "STRING", "^(" + "|".join(a.cpc) + ")"),
        bigquery.ScalarQueryParameter("limit", "INT64", a.limit),
    ]
    cfg = bigquery.QueryJobConfig(
        query_parameters=params, dry_run=a.dry_run, use_query_cache=True,
        maximum_bytes_billed=int(a.max_gb * 1e9))
    query = QUERY.format(abstract=ABSTRACT if a.with_abstract else NO_ABSTRACT,
                         cites=CITES if a.with_citations else NO_CITES)
    job = client.query(query, job_config=cfg)
    if a.dry_run:
        gb = job.total_bytes_processed / 1e9
        print(f"Would scan {gb:.1f} GB (about {gb / 1000:.1%} of the 1 TB monthly free tier)")
        return
    n = 0
    with open(a.out, "w") as f:
        for r in job.result():
            if not (r.title and r.filing_date and r.grant_date):
                continue
            pid = patent_id(r.publication_number)
            f.write(json.dumps({
                "id": pid, "title": r.title, "abstract": r.abstract or "", "claims": split_claims(r.claims),
                "cpc": list(r.cpc), "filing_date": to_date(r.filing_date), "grant_date": to_date(r.grant_date),
                "assignee": r.assignees[0] if r.assignees else None,
                "family_ids": [str(r.family_id)] if r.family_id and r.family_id != -1 else [],
                "cites": [patent_id(c) for c in r.cites][:50], "cited_by_count": 0, "maintenance": None,
                "url": f"https://patents.google.com/patent/{pid}", "synthetic": False}) + "\n")
            n += 1
    print(f"wrote {n} patents to {a.out}; cited_by_count and maintenance are filled by later steps")


if __name__ == "__main__":
    main()
