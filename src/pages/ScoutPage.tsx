import { useEffect, useState } from "react";
import { ErrorNote, LegalNotice, Meter, PatentRef, Spinner, StatusTag, ExternalLink, fmtDate } from "../components/ui";
import { api, type Opportunity } from "../lib/api";

const COMPONENTS: [string, string, string][] = [
  ["citations", "Citations", "30%: how often later patents cite it"],
  ["family", "Family", "15%: related filings, a sign the owner valued it"],
  ["clearance", "Clearance", "30%: how unlike any in-force patent it is"],
  ["activity", "Activity", "25%: new patents in its class since it expired"],
];

export function ScoutPage() {
  const [cpc, setCpc] = useState("");
  const [limit, setLimit] = useState(20);
  const [statuses, setStatuses] = useState<("lapsed" | "expired")[]>(["lapsed", "expired"]);
  const [rows, setRows] = useState<Opportunity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const prefixes = cpc.split(",").map((s) => s.trim().toUpperCase().replace(/\s/g, "")).filter(Boolean);
      setRows(await api.scout({ cpc_prefixes: prefixes.length ? prefixes : undefined, limit, statuses }));
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

  const toggle = (s: "lapsed" | "expired") =>
    setStatuses((cur) => (cur.includes(s) ? (cur.length > 1 ? cur.filter((x) => x !== s) : cur) : [...cur, s]));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Opportunity scout</h1>
          <p>
            Anyone may practice what an expired or lapsed patent claims, as long as no in-force patent still covers it. Scout ranks them by second-wind potential: proven interest, clear space
            and an active market.
          </p>
        </div>
      </div>

      <form
        className="panel panel-pad toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className="field grow">
          <span>CPC prefixes</span>
          <input className="input" value={cpc} onChange={(e) => setCpc(e.target.value)} placeholder="All classes, or e.g. A47J31/44, A47J31/06" />
        </label>
        <div className="field">
          <span>Status</span>
          <div className="chips">
            {(["expired", "lapsed"] as const).map((s) => (
              <button type="button" key={s} className="chip" aria-pressed={statuses.includes(s)} onClick={() => toggle(s)}>
                {s === "expired" ? "Expired" : "Lapsed"}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Show</span>
          <select className="select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Ranking…" : "Rank opportunities"}
        </button>
      </form>

      <p className="faint small" style={{ margin: "12px 2px 18px" }}>
        Score weights: {COMPONENTS.map(([, n, d]) => `${n} ${d.split(":")[0]}`).join(", ")}. The live corpus has no maintenance-fee data, so only
        term-expired patents appear and citation counts may be zero.
      </p>

      {error && <ErrorNote error={error} onRetry={run} />}
      {busy && !rows && <Spinner label="Comparing every expired patent with the in-force ones…" />}
      {rows && rows.length === 0 && (
        <div className="panel empty">
          <h2>No expired or lapsed patents match</h2>
          <p>Try a shorter CPC prefix, such as A47J31, or clear the field to rank every class.</p>
        </div>
      )}

      <div className="opps" style={{ opacity: busy && rows ? 0.55 : 1 }}>
        {rows?.map((o) => (
          <article className="panel opp" key={o.patent.id}>
            <span className="rank">{o.rank}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <PatentRef p={o.patent} />
                <StatusTag p={o.patent} />
              </div>
              <p className="faint small" style={{ marginTop: 4 }}>
                {o.patent.assignee ?? "Unknown assignee"}, filed {fmtDate(o.patent.filing_date)}. {o.why_lapsed}{" "}
                {o.what_changed.years_since_lapse} years ago. <ExternalLink href={o.patent.url}>Google Patents</ExternalLink>
              </p>
              <ul>
                {o.why_ranked.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {o.what_changed.possible_blockers.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn ghost sm" type="button" aria-expanded={open === o.patent.id} onClick={() => setOpen(open === o.patent.id ? null : o.patent.id)}>
                    {open === o.patent.id ? "Hide" : "Show"} {o.what_changed.possible_blockers.length} similar in-force patent
                    {o.what_changed.possible_blockers.length === 1 ? "" : "s"}
                  </button>
                  {open === o.patent.id && (
                    <ul className="small">
                      {o.what_changed.possible_blockers.slice(0, 25).map((b) => (
                        <li key={b.id}>
                          <PatentRef p={b} />, in force until {fmtDate(b.expiry_date)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="score">
              <b>{o.score.toFixed(1)}</b>
              <span className="faint small"> / 100</span>
              <div className="bars">
                {COMPONENTS.map(([k, n, d]) => (
                  <div key={k} title={d}>
                    <span>{n}</span>
                    <Meter value={o.components[k] ?? 0} />
                    <span className="num">{Math.round((o.components[k] ?? 0) * 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      {rows && rows.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <LegalNotice compact />
        </div>
      )}
    </div>
  );
}
