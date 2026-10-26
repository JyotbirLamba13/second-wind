import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorNote, LegalNotice, PatentRef, Spinner, StatusTag, decode, fmtDate } from "../components/ui";
import { api, type PatentSummary, type SearchHit, type SearchMode, type Status } from "../lib/api";

const MODES: { id: SearchMode; name: string; desc: string }[] = [
  { id: "hybrid", name: "Hybrid", desc: "Reciprocal-rank fusion of the three methods below. Used by idea check." },
  { id: "bm25", name: "Keyword (BM25)", desc: "Exact-term relevance, weighted by how rare each term is." },
  { id: "embedding", name: "Embedding", desc: "Similarity of term and term-pair profiles, catches reworded text." },
  { id: "cpc", name: "CPC class", desc: "Ranks by predicted classification, ties broken by keyword score." },
];
const STATUSES: { id: Status; name: string }[] = [
  { id: "in_force", name: "In force" },
  { id: "expired", name: "Expired" },
  { id: "lapsed", name: "Lapsed" },
];
const PAGE = 50;

type Result =
  | { kind: "browse"; rows: PatentSummary[]; offset: number }
  | { kind: "search"; hits: SearchHit[]; mode: SearchMode }
  | { kind: "compare"; byMode: Record<string, SearchHit[]> };

export function SearchPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [compare, setCompare] = useState(false);
  const [k, setK] = useState(20);
  const [cpc, setCpc] = useState("");
  const [status, setStatus] = useState<Status[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const q = query.trim();
  const searching = q.length > 0;

  async function run(offset = 0) {
    if (searching && q.length < 3) {
      setError("Enter at least three characters to search, or clear the query to browse.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!searching) {
        // The list endpoint takes one status; with several picked, filter the page client-side.
        const prefix = cpc.trim().toUpperCase().replace(/\s/g, "");
        const rows = await api.patents({ status: status.length === 1 ? status[0] : "", cpc: prefix, limit: PAGE, offset });
        setResult({ kind: "browse", rows: status.length > 1 ? rows.filter((r) => status.includes(r.status)) : rows, offset });
        return;
      }
      const hints = cpc.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const body = { query: q, k, cpc_hints: hints.length ? hints : undefined, status: status.length ? status : undefined };
      if (compare) {
        const all = await Promise.all(MODES.map((m) => api.search({ ...body, mode: m.id })));
        setResult({ kind: "compare", byMode: Object.fromEntries(MODES.map((m, i) => [m.id, all[i]])) });
      } else {
        setResult({ kind: "search", hits: await api.search({ ...body, mode }), mode });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (s: Status) => setStatus((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const comps = result?.kind === "search" && result.hits[0] ? Object.keys(result.hits[0].components) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Patent search</h1>
          <p>Search claims and titles with any of four ranking methods, or leave the query empty to browse the whole corpus by legal status and CPC class.</p>
        </div>
      </div>

      <form
        className="panel panel-pad"
        style={{ display: "grid", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          run(0);
        }}
      >
        <div className="toolbar">
          <label className="field grow">
            <span>Query</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Leave empty to browse, or try: milk frothing steam wand" />
          </label>
          <label className="field">
            <span>Method</span>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} disabled={compare || !searching}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Results</span>
            <select className="select" value={k} onChange={(e) => setK(Number(e.target.value))} disabled={!searching}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Loading…" : searching ? "Search" : "Browse"}
          </button>
        </div>
        <div className="toolbar">
          <label className="field">
            <span>CPC class</span>
            <input className="input" value={cpc} onChange={(e) => setCpc(e.target.value)} placeholder="A47J31/44" />
          </label>
          <div className="field">
            <span>Legal status</span>
            <div className="chips">
              {STATUSES.map((s) => (
                <button type="button" key={s.id} className="chip" aria-pressed={status.includes(s.id)} onClick={() => toggle(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <label className="field" style={{ flexDirection: "row", display: "flex", alignItems: "center", gap: 8, minWidth: 0, opacity: searching ? 1 : 0.5 }}>
            <input type="checkbox" checked={compare} disabled={!searching} onChange={(e) => setCompare(e.target.checked)} style={{ accentColor: "var(--stamp)" }} />
            <span style={{ color: "var(--ink)" }}>Compare all four methods</span>
          </label>
        </div>
        <p className="faint small">
          {!searching
            ? "Browsing every patent, filtered by CPC prefix and legal status, 50 per page."
            : compare
              ? "Runs the same query through every method so you can see where they agree. The CPC class boosts matching patents."
              : `${MODES.find((m) => m.id === mode)!.desc} The CPC class boosts matching patents.`}
        </p>
      </form>

      <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
        {error && <ErrorNote error={error} />}
        {busy && !result && <Spinner label="Loading…" />}

        {result?.kind === "browse" && (
          <section className="panel" style={{ opacity: busy ? 0.55 : 1 }}>
            <div className="panel-head">
              <h2>{result.rows.length ? `Patents ${result.offset + 1} to ${result.offset + result.rows.length}` : "No patents match"}</h2>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btn ghost sm" disabled={result.offset === 0 || busy} onClick={() => run(Math.max(0, result.offset - PAGE))}>
                  Previous
                </button>
                <button className="btn ghost sm" disabled={result.rows.length < PAGE || busy} onClick={() => run(result.offset + PAGE)}>
                  Next
                </button>
              </span>
            </div>
            {result.rows.length === 0 ? (
              <p className="panel-pad muted">Try a shorter CPC prefix or a different status.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Patent</th>
                      <th>Status</th>
                      <th>Assignee</th>
                      <th>Filed</th>
                      <th>Term ends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((p) => (
                      <tr key={p.id} className="click" onClick={() => nav(`/app/patents/${encodeURIComponent(p.id)}`)}>
                        <td style={{ minWidth: 300 }}>
                          <PatentRef p={p} />
                          <div className="faint small">{[...new Set(p.cpc)].slice(0, 3).join(", ")}</div>
                        </td>
                        <td><StatusTag p={p} /></td>
                        <td className="small">{p.assignee ?? <span className="faint">Not listed</span>}</td>
                        <td className="small nowrap">{fmtDate(p.filing_date)}</td>
                        <td className="small nowrap">{fmtDate(p.expiry_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {result?.kind === "search" && (
          <section className="panel" style={{ opacity: busy ? 0.55 : 1 }}>
            <div className="panel-head">
              <h2>{result.hits.length} results</h2>
              <span className="faint small">{MODES.find((m) => m.id === result.mode)!.name}</span>
            </div>
            {result.hits.length === 0 ? (
              <p className="panel-pad muted">No patent uses these terms. Try broader wording, or the embedding method for reworded text.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Patent</th>
                      <th>Status</th>
                      <th>Filed</th>
                      <th className="num">Score</th>
                      {comps.map((c) => (
                        <th className="num" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.hits.map((h, i) => (
                      <tr key={h.patent.id} className="click" onClick={() => nav(`/app/patents/${encodeURIComponent(h.patent.id)}`)}>
                        <td className="num faint">{i + 1}</td>
                        <td style={{ minWidth: 280 }}>
                          <PatentRef p={h.patent} />
                          <div className="faint small">{[...new Set(h.patent.cpc)].slice(0, 3).join(", ")}</div>
                        </td>
                        <td><StatusTag p={h.patent} /></td>
                        <td className="small nowrap">{fmtDate(h.patent.filing_date)}</td>
                        <td className="num">{h.score.toFixed(3)}</td>
                        {comps.map((c) => (
                          <td className="num small muted" key={c}>
                            {(h.components[c] ?? 0).toFixed(3)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {result?.kind === "compare" && (
          <section className="panel" style={{ opacity: busy ? 0.55 : 1 }}>
            <div className="panel-head">
              <h2>Method comparison</h2>
              <span className="faint small">"In all" marks patents every method found</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    {MODES.map((m) => (
                      <th key={m.id}>{m.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.max(0, ...Object.values(result.byMode).map((v) => v.length)) }, (_, i) => (
                    <tr key={i}>
                      <td className="num faint">{i + 1}</td>
                      {MODES.map((m) => {
                        const h = result.byMode[m.id][i];
                        if (!h) return <td key={m.id} />;
                        const everywhere = MODES.every((x) => result.byMode[x.id].some((y) => y.patent.id === h.patent.id));
                        return (
                          <td key={m.id} style={{ minWidth: 200 }}>
                            <PatentRef p={h.patent} title={false} />
                            {everywhere && <span className="faint small"> in all</span>}
                            <div className="small muted" style={{ fontWeight: everywhere ? 600 : 400 }}>
                              {decode(h.patent.title)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {result && (
          <>
            {result.kind === "browse" && (
              <p className="faint small">* In force is assumed from the 20-year term because maintenance-fee records aren't loaded.</p>
            )}
            <LegalNotice compact />
          </>
        )}
      </div>
    </div>
  );
}
