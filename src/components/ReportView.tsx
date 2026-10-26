import { useState } from "react";
import { api, type CheckReport, type Citation } from "../lib/api";
import {
  ExternalLink, LEVEL_MEANING, LegalNotice, Meter, PatentRef, StatusTag, Triage, USPTO_CLINICS, USPTO_PRO_BONO, USPTO_ROSTER,
  fmtDate, pct,
} from "./ui";

function Cites({ cs }: { cs: Citation[] }) {
  return (
    <>
      {cs.map((c) =>
        c.url ? (
          <a key={c.patent_id + c.field} className="cite" href={c.url} target="_blank" rel="noreferrer">
            [{c.patent_id}, {c.field}]
          </a>
        ) : (
          <span key={c.patent_id + c.field} className="cite faint">
            [{c.patent_id}, mock]
          </span>
        ),
      )}
    </>
  );
}

export function PacketButton({ report }: { report: CheckReport }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function download() {
    setBusy(true);
    setErr("");
    try {
      const md = await api.packet(report);
      const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `second-life-prior-art-${report.id}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span style={{ display: "inline-grid", gap: 4 }}>
      <button className="btn sm" onClick={download} disabled={busy}>
        {busy ? "Preparing packet…" : "Download prior-art packet"}
      </button>
      {err && <span className="small" style={{ color: "var(--red)" }}>{err}</span>}
    </span>
  );
}

export function ReportView({ report: r }: { report: CheckReport }) {
  const u = r.understanding;
  const [allBlockers, setAllBlockers] = useState(false);
  const blockers = allBlockers ? r.blockers : r.blockers.slice(0, 5);
  return (
    <div className="report">
      {r.data_note && (
        <div className={`notice ${r.data_mode === "mock" ? "warn" : ""}`} role="note">
          <div>
            <strong>{r.data_mode === "mock" ? "Demo data. " : "Outside the live corpus. "}</strong>
            {r.data_note}
          </div>
        </div>
      )}

      <section className="panel panel-pad verdict">
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Triage level={r.triage} label={`${r.triage[0].toUpperCase()}${r.triage.slice(1)}: ${LEVEL_MEANING[r.triage].toLowerCase()}`} />
            <span className="faint small">
              Report {r.id}, {new Date(r.created_at).toLocaleString()}
            </span>
          </div>
          <h2>{r.summary}</h2>
          <p className="idea">“{r.idea}”</p>
          <div className="levels">
            <div>
              <span>Novelty against closest prior art</span>
              <Triage level={r.novelty_level} />
            </div>
            <div>
              <span>Blocking risk from in-force patents</span>
              <Triage level={r.blocking_level} />
            </div>
          </div>
        </div>
        <PacketButton report={r} />
      </section>

      <section className={`panel panel-pad handoff ${r.attorney_handoff ? "" : "calm"}`}>
        <h2 style={{ fontSize: "1.15rem" }}>{r.attorney_handoff ? "Talk to a patent attorney before going further" : "No blocking patent crossed the threshold"}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {r.attorney_handoff_reason} Bring the prior-art packet to that conversation.
        </p>
        <ul className="small">
          <li>
            <a href={USPTO_ROSTER} target="_blank" rel="noreferrer">Find a registered practitioner</a> on the USPTO roster
          </li>
          <li>
            <a href={USPTO_PRO_BONO} target="_blank" rel="noreferrer">USPTO Patent Pro Bono Program</a> for eligible inventors
          </li>
          <li>
            <a href={USPTO_CLINICS} target="_blank" rel="noreferrer">Law school clinics</a> certified to practice before the USPTO
          </li>
        </ul>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>How the idea was read</h2>
          <span className="faint small">{u.source === "llm" ? "Read by AI model" : "AI unavailable: searched your exact words"}</span>
        </div>
        <div className="panel-pad">
          <dl className="kv">
            <dt>Summary</dt>
            <dd>{u.summary}</dd>
            {u.industry && (
              <>
                <dt>Industry</dt>
                <dd>{u.industry}</dd>
              </>
            )}
            {u.features.length > 0 && (
              <>
                <dt>Core features</dt>
                <dd className="chips">{u.features.map((f) => <span className="chip" key={f}>{f}</span>)}</dd>
              </>
            )}
            {u.search_terms.length > 0 && (
              <>
                <dt>Search vocabulary</dt>
                <dd className="chips">{u.search_terms.map((f) => <span className="chip" key={f}>{f}</span>)}</dd>
              </>
            )}
            {u.cpc_hints.length > 0 && (
              <>
                <dt>Likely CPC classes</dt>
                <dd className="chips">{u.cpc_hints.map((f) => <span className="chip" key={f}>{f}</span>)}</dd>
              </>
            )}
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Findings</h2>
          <span className="faint small">Each statement cites its source</span>
        </div>
        <div className="panel-pad">
          <ul className="findings">
            {r.claims.map((c, i) => (
              <li key={i}>
                {c.text}
                <Cites cs={c.citations} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Possible blocking patents</h2>
          <span className="faint small">{r.blockers.length} in force above the overlap threshold</span>
        </div>
        {r.blockers.length === 0 ? (
          <p className="panel-pad muted">No in-force patent in the corpus overlaps enough to flag. That doesn't rule out patents outside it.</p>
        ) : (
          blockers.map((b) => (
            <div className="item" key={b.patent.id}>
              <div className="item-head">
                <PatentRef p={b.patent} />
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <StatusTag p={b.patent} />
                  <Triage level={b.level} />
                </span>
              </div>
              <div className="cover">
                <span>Claim overlap {pct(b.claim_coverage)}</span>
                <Meter value={b.claim_coverage} level={b.level} />
              </div>
              <p className="muted small">{b.why}</p>
              <div className="terms">
                {b.matched_terms.map((t) => <span className="term hit" key={"m" + t} title="In your idea and in claim 1">{t}</span>)}
                {b.unmatched_distinctive_terms.map((t) => <span className="term miss" key={"u" + t} title="In claim 1 but not in your idea">{t}</span>)}
              </div>
              <p className="faint small">
                Red terms appear in both your idea and claim 1. Green terms are claim elements your description doesn't mention.
                {b.patent.assignee ? ` Assignee: ${b.patent.assignee}.` : ""} Expires {fmtDate(b.patent.expiry_date)}.{" "}
                <ExternalLink href={b.patent.url}>Google Patents</ExternalLink>
              </p>
            </div>
          ))
        )}
        {r.blockers.length > 5 && (
          <div className="item">
            <button className="btn ghost sm" style={{ justifySelf: "start" }} onClick={() => setAllBlockers(!allBlockers)}>
              {allBlockers ? "Show the top 5 only" : `Show all ${r.blockers.length} possible blockers`}
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Closest prior art</h2>
          <span className="faint small">Any status, ranked by overlap</span>
        </div>
        {r.prior_art.length === 0 ? (
          <p className="panel-pad muted">Nothing in the corpus overlaps meaningfully with this description.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Patent</th>
                  <th>Status</th>
                  <th className="num">Overlap</th>
                  <th>Shared terms</th>
                </tr>
              </thead>
              <tbody>
                {r.prior_art.map((a) => (
                  <tr key={a.patent.id}>
                    <td style={{ minWidth: 260 }}>
                      <PatentRef p={a.patent} />
                    </td>
                    <td><StatusTag p={a.patent} /></td>
                    <td className="num">{pct(a.claim_coverage)}</td>
                    <td className="small muted">{a.matched_terms.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel panel-pad assume">
        <p className="faint small">Riskiest assumption</p>
        <h3 style={{ marginTop: 6 }}>{r.riskiest_assumption.assumption}</h3>
        <p style={{ marginTop: 12 }}>
          <b>Two-week test.</b> {r.riskiest_assumption.two_week_test}
        </p>
        {r.riskiest_assumption.citations.length > 0 && (
          <p className="small" style={{ marginTop: 8 }}>
            Based on <Cites cs={r.riskiest_assumption.citations} />
          </p>
        )}
      </section>

      <LegalNotice />
      <p className="faint small">{r.disclaimer} Completed in {Math.round(r.metrics.runtime_ms ?? 0)} ms.</p>
    </div>
  );
}
