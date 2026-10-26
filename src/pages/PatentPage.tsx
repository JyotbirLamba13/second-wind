import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useService } from "../components/AppShell";
import { ErrorNote, ExternalLink, LegalNotice, Spinner, StatusTag, fmtDate } from "../components/ui";
import { api, type PatentDetail } from "../lib/api";

export function PatentPage() {
  const { id = "" } = useParams();
  const { stats } = useService();
  const [p, setP] = useState<PatentDetail | null>(null);
  const [error, setError] = useState("");
  const [allClaims, setAllClaims] = useState(false);

  useEffect(() => {
    setP(null);
    setError("");
    api.patent(id).then(setP).catch((e) => setError((e as Error).message));
  }, [id]);

  if (error)
    return (
      <div className="page">
        <ErrorNote error={error === "patent not found" ? `No patent with id ${id} is in the corpus.` : error} />
      </div>
    );
  if (!p)
    return (
      <div className="page">
        <Spinner label="Loading patent…" />
      </div>
    );

  const today = stats?.as_of ?? new Date().toISOString().slice(0, 10);
  const events = [
    { label: "Filed", date: p.filing_date },
    { label: "Granted", date: p.grant_date },
    ...(p.lapse_date ? [{ label: p.lapse_reason ?? "Lapsed", date: p.lapse_date }] : []),
    { label: "20-year term ends", date: p.expiry_date },
  ].sort((a, b) => a.date.localeCompare(b.date));
  const claims = allClaims ? p.claims : p.claims.slice(0, 3);
  const cpc = [...new Set(p.cpc.map((c) => c.replace(/\s/g, "")))];
  const family = p.family_ids.filter((f) => f && f !== "-1"); // the source uses -1 for "no family"

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="faint small">
            <Link to="/app/research/browse">Browse corpus</Link> / {p.id}
          </p>
          <h1 style={{ marginTop: 6, maxWidth: "32ch" }}>{p.title}</h1>
          <p style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span className="pid">{p.id}</span>
            <StatusTag p={p} />
            <span>{p.assignee ?? "No assignee listed"}</span>
          </p>
        </div>
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn ghost" to={`/app/research/search?q=${encodeURIComponent(p.title)}`}>
            Find similar patents
          </Link>
          {p.url && (
            <a className="btn" href={p.url} target="_blank" rel="noreferrer">
              Open on Google Patents
            </a>
          )}
        </span>
      </div>

      <div className="pd">
        <section className="panel">
          <div className="panel-head">
            <h2>Claims</h2>
            <span className="faint small">{p.claims.length} in record</span>
          </div>
          <div className="panel-pad claims">
            {p.abstract && <p className="muted">{p.abstract}</p>}
            {claims.map((c, i) => (
              <p key={i}>{c}</p>
            ))}
            {p.claims.length > 3 && (
              <button className="btn ghost sm" style={{ justifySelf: "start" }} onClick={() => setAllClaims(!allClaims)}>
                {allClaims ? "Show first three claims" : `Show all ${p.claims.length} claims`}
              </button>
            )}
            {p.claims.length === 0 && <p className="muted">No claims text is stored for this patent.</p>}
          </div>
        </section>

        <aside style={{ display: "grid", gap: 18 }}>
          <section className="panel panel-pad">
            <h2 style={{ fontSize: "1.1rem", marginBottom: 14 }}>Key dates</h2>
            <div className="timeline">
              {events.map((e) => (
                <div key={e.label} className={e.date <= today ? "now" : ""}>
                  {e.label}
                  <span>{fmtDate(e.date)}</span>
                </div>
              ))}
            </div>
            {!p.fee_data && (
              <p className="faint small" style={{ marginTop: 14 }}>
                Maintenance-fee records aren't loaded, so status assumes all fees were paid. Check USPTO Patent Center before relying on it.
              </p>
            )}
          </section>
          <section className="panel panel-pad">
            <h2 style={{ fontSize: "1.1rem", marginBottom: 10 }}>Classification</h2>
            <div className="chips">
              {cpc.map((c) => (
                <span className="chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
            <dl className="kv small" style={{ marginTop: 16, gridTemplateColumns: "110px 1fr" }}>
              <dt>Cited by</dt>
              <dd>{p.cited_by_count} patents</dd>
              <dt>Family</dt>
              <dd>{family.length ? family.join(", ") : "None recorded"}</dd>
              <dt>Cites</dt>
              <dd>{p.cites.length ? `${p.cites.length} patents` : "None recorded"}</dd>
            </dl>
          </section>
          <LegalNotice compact />
          <p className="faint small">
            Data: Google Patents Public Data, CC BY 4.0. <ExternalLink href={p.url}>Source record</ExternalLink>
          </p>
        </aside>
      </div>
    </div>
  );
}
