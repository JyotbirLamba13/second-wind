import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorNote, LegalNotice, PatentRef, Spinner, StatusTag, fmtDate } from "../components/ui";
import { api, type SearchHit, type SearchMode, type Status } from "../lib/api";

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

export function SearchPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [compare, setCompare] = useState(false);
  const [k, setK] = useState(20);
  const [cpc, setCpc] = useState("");
  const [status, setStatus] = useState<Status[]>([]);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [multi, setMulti] = useState<Record<string, SearchHit[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (query.trim().length < 3) {
      setError("Enter at least three characters to search.");
      return;
    }
    setBusy(true);
    setError("");
    const body = {
      query: query.trim(),
      k,
      cpc_hints: cpc.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      status: status.length ? status : undefined,
    };
    if (!body.cpc_hints.length) delete (body as { cpc_hints?: string[] }).cpc_hints;
    try {
      if (compare) {
        const all = await Promise.all(MODES.map((m) => api.search({ ...body, mode: m.id })));
        setMulti(Object.fromEntries(MODES.map((m, i) => [m.id, all[i]])));
        setHits(null);
      } else {
        setHits(await api.search({ ...body, mode }));
        setMulti(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (params.get("q")) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (s: Status) => setStatus((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const comps = hits?.[0] ? Object.keys(hits[0].components) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Patent search</h1>
          <p>Search claims and titles directly with any of the four ranking methods, or compare them side by side on the same query.</p>
        </div>
      </div>

      <form
        className="panel panel-pad"
        style={{ display: "grid", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="toolbar">
          <label className="field grow">
            <span>Query</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="milk frothing steam wand with temperature sensor" />
          </label>
          <label className="field">
            <span>Method</span>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} disabled={compare}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Results</span>
            <select className="select" value={k} onChange={(e) => setK(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
        <div className="toolbar">
          <label className="field">
            <span>CPC hints</span>
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
          <label className="field" style={{ flexDirection: "row", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} style={{ accentColor: "var(--stamp)" }} />
            <span style={{ color: "var(--ink)" }}>Compare all four methods</span>
          </label>
        </div>
        <p className="faint small">{compare ? "Runs the same query through every method so you can see where they agree." : MODES.find((m) => m.id === mode)!.desc}</p>
      </form>

      <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
        {error && <ErrorNote error={error} />}
        {busy && <Spinner label="Searching…" />}

        {hits && (
          <section className="panel">
            <div className="panel-head">
              <h2>{hits.length} results</h2>
              <span className="faint small">{MODES.find((m) => m.id === mode)!.name}</span>
            </div>
            {hits.length === 0 ? (
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
                    {hits.map((h, i) => (
                      <tr key={h.patent.id} className="click" onClick={() => nav(`/app/patents/${encodeURIComponent(h.patent.id)}`)}>
                        <td className="num faint">{i + 1}</td>
                        <td style={{ minWidth: 280 }}>
                          <PatentRef p={h.patent} />
                          <div className="faint small">{h.patent.cpc.slice(0, 3).join(", ")}</div>
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

        {multi && (
          <section className="panel">
            <div className="panel-head">
              <h2>Method comparison</h2>
              <span className="faint small">Bold ids appear in every method's results</span>
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
                  {Array.from({ length: Math.max(...Object.values(multi).map((v) => v.length)) }, (_, i) => (
                    <tr key={i}>
                      <td className="num faint">{i + 1}</td>
                      {MODES.map((m) => {
                        const h = multi[m.id][i];
                        if (!h) return <td key={m.id} />;
                        const everywhere = MODES.every((x) => multi[x.id].some((y) => y.patent.id === h.patent.id));
                        return (
                          <td key={m.id} style={{ minWidth: 200 }}>
                            <PatentRef p={h.patent} title={false} />
                            {everywhere && <span className="faint small"> in all</span>}
                            <div className="small muted" style={{ fontWeight: everywhere ? 600 : 400 }}>
                              {h.patent.title}
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
        {(hits || multi) && <LegalNotice compact />}
      </div>
    </div>
  );
}
