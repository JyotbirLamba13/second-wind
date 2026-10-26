import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorNote, PatentRef, Spinner, StatusTag, fmtDate } from "../components/ui";
import { api, type PatentSummary, type Status } from "../lib/api";

const PAGE = 50;

export function BrowsePage() {
  const nav = useNavigate();
  const [status, setStatus] = useState<Status | "">("");
  const [cpc, setCpc] = useState("");
  const [applied, setApplied] = useState({ status: "" as Status | "", cpc: "" });
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<PatentSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    api
      .patents({ ...applied, limit: PAGE, offset })
      .then((r) => live && setRows(r))
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [applied, offset]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Browse corpus</h1>
          <p>Every indexed patent, filterable by legal status and CPC prefix. Open one to read its claims and key dates.</p>
        </div>
      </div>

      <form
        className="panel panel-pad toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied({ status, cpc: cpc.trim().toUpperCase().replace(/\s/g, "") });
        }}
      >
        <label className="field">
          <span>Legal status</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
            <option value="">Any status</option>
            <option value="in_force">In force</option>
            <option value="expired">Expired</option>
            <option value="lapsed">Lapsed</option>
          </select>
        </label>
        <label className="field grow">
          <span>CPC prefix</span>
          <input className="input" value={cpc} onChange={(e) => setCpc(e.target.value)} placeholder="A47J31/44 (milk frothing), A47J31/06 (filters)…" />
        </label>
        <button className="btn">Apply filters</button>
      </form>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h2>
            {rows ? (rows.length ? `Patents ${offset + 1} to ${offset + rows.length}` : "No patents match") : "Patents"}
          </h2>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost sm" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </button>
            <button className="btn ghost sm" disabled={!rows || rows.length < PAGE || busy} onClick={() => setOffset(offset + PAGE)}>
              Next
            </button>
          </span>
        </div>
        {error && (
          <div className="panel-pad">
            <ErrorNote error={error} />
          </div>
        )}
        {busy && !rows && (
          <div className="panel-pad">
            <Spinner label="Loading patents…" />
          </div>
        )}
        {rows && rows.length === 0 && <p className="panel-pad muted">Try a shorter CPC prefix or a different status.</p>}
        {rows && rows.length > 0 && (
          <div className="table-wrap" style={{ opacity: busy ? 0.55 : 1 }}>
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
                {rows.map((p) => (
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
      <p className="faint small" style={{ marginTop: 12 }}>
        * In force is assumed from the 20-year term because maintenance-fee records aren't loaded.
      </p>
    </div>
  );
}
