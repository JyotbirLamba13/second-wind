import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Triage } from "../components/ui";
import { deleteReport, savedReports } from "../lib/local";

export function ReportsPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState(savedReports());

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Saved reports</h1>
          <p>Every idea check is saved in this browser, so you can reopen it, continue the conversation or download its packet.</p>
        </div>
        <Link to="/app/check" className="btn">
          Check a new idea
        </Link>
      </div>
      <section className="panel">
        {rows.length === 0 ? (
          <div className="empty">
            <h2>No reports yet</h2>
            <p>Run an idea check and it will be listed here. Reports stay in this browser only; clearing site data removes them.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Idea</th>
                  <th>Data</th>
                  <th className="num">Blockers</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => nav(`/app/check?report=${r.id}`)}>
                    <td><Triage level={r.triage} /></td>
                    <td className="ttl" style={{ minWidth: 280 }}>{r.idea}</td>
                    <td className="small">{r.data_mode === "mock" ? <span className="status mock">Demo</span> : "Live"}</td>
                    <td className="num">{r.blockers.length}</td>
                    <td className="small">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReport(r.id);
                          setRows(savedReports());
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
