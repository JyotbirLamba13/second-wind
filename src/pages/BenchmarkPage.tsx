import { useState } from "react";
import { ErrorNote } from "../components/ui";
import { api, type BenchmarkResult } from "../lib/api";

const NAMES: Record<string, string> = { hybrid: "Hybrid", bm25: "Keyword (BM25)", embedding: "Embedding", cpc: "CPC class" };

export function BenchmarkPage() {
  const [res, setRes] = useState<BenchmarkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      setRes(await api.benchmark([10, 50]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Retrieval benchmark</h1>
          <p>
            How well does search find the prior art a patent examiner would cite? The benchmark runs a set of real applications through every
            method and measures recall@k: the share of examiner-cited patents found in the top k results.
          </p>
        </div>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run benchmark"}
        </button>
      </div>

      <section className="panel panel-pad" style={{ display: "grid", gap: 12 }}>
        <h2 style={{ fontSize: "1.1rem" }}>Targets</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
          <li>Recall@50 of at least 60%</li>
          <li>Recall@10 of at least 35%</li>
          <li>Hybrid at least 15 points above the best single method at recall@50</li>
        </ul>
        <p className="faint small">Targets assume a 300-application benchmark set on a real corpus. Institutions can run it on their own cases.</p>
      </section>

      <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
        {error && <ErrorNote error={error} onRetry={run} />}
        {res && res.applications === 0 && (
          <div className="notice warn">
            <div>
              <strong>No usable applications for this corpus.</strong> The bundled benchmark set cites patents from the synthetic sample corpus, none
              of which are in the live coffee-maker corpus, so recall can't be measured here. A real run needs applications whose examiner citations
              fall inside A47J31.
            </div>
          </div>
        )}
        {res && (
          <section className="panel">
            <div className="panel-head">
              <h2>Results</h2>
              <span className="faint small">
                {res.applications} applications, {res.corpus_size.toLocaleString()} patents
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Method</th>
                    {res.ks.map((k) => (
                      <th className="num" key={k}>
                        Recall@{k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(res.results).map(([m, r]) => (
                    <tr key={m}>
                      <td style={{ fontWeight: m === "hybrid" ? 700 : 400 }}>{NAMES[m] ?? m}</td>
                      {res.ks.map((k) => (
                        <td className="num" key={k}>
                          {res.applications ? `${Math.round((r[`recall@${k}`] ?? 0) * 100)}%` : "n/a"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {res.applications > 0 && (
              <p className="panel-pad small muted">
                Best single method: {NAMES[String(res.best_baseline.method)]}. Hybrid is {Math.round(res.hybrid_vs_best_baseline * 100)} points{" "}
                {res.hybrid_vs_best_baseline >= 0 ? "above" : "below"} it.
              </p>
            )}
            <p className="panel-pad faint small" style={{ paddingTop: 0 }}>
              {res.note}
            </p>
          </section>
        )}
        {!res && !busy && !error && (
          <div className="panel empty">
            <h2>Run the benchmark to see method recall</h2>
            <p>It takes a few seconds. Results are recomputed on every run, so they always reflect the corpus currently loaded.</p>
          </div>
        )}
      </div>
    </div>
  );
}
