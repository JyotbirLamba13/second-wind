import { useEffect, useState } from "react";
import { useService } from "../components/AppShell";
import { ErrorNote, PatentRef, Spinner, fmtDate } from "../components/ui";
import { api, type PatentSummary } from "../lib/api";

type Profile = {
  years: [number, number][];
  groups: [string, number][];
  assignees: [string, number][];
  soon: PatentSummary[];
  within2: number;
  withAssignee: number;
};
let cache: Profile | null = null; // computed server-side; kept for the visit

async function loadProfile(): Promise<Profile> {
  if (cache) return cache;
  const r = await api.corpusProfile();
  cache = {
    years: r.filings_by_year.map((y) => [y.year, y.count]),
    groups: r.top_cpc_groups.map((g) => [g.code, g.count]),
    assignees: r.top_assignees.map((a) => [a.name, a.count]),
    soon: r.next_to_expire,
    within2: r.ending_within_two_years,
    withAssignee: r.with_assignee,
  };
  return cache;
}

function HBars({ rows, label }: { rows: [string, number][]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div role="table" aria-label={label}>
      {rows.map(([k, v]) => (
        <div className="hbar" role="row" key={k} title={`${k}: ${v.toLocaleString()} patents`}>
          <span role="cell" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {k}
          </span>
          <span className="track" aria-hidden="true">
            <i style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span role="cell" className="num muted">
            {v.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function YearChart({ years }: { years: [number, number][] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...years.map((y) => y[1]));
  const w = 720, h = 200, pad = 24, bw = (w - pad) / years.length;
  const ticks = years.filter(([y]) => y % 10 === 0);
  const h0 = years.find(([y]) => y === hover);
  return (
    <div style={{ position: "relative" }}>
      <p className="small muted" style={{ minHeight: 22 }}>
        {h0 ? `${h0[0]}: ${h0[1].toLocaleString()} patents filed` : "Hover a bar for the count"}
      </p>
      <svg viewBox={`0 0 ${w} ${h + 22}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Patents by filing year">
        <line x1={pad} x2={w} y1={h} y2={h} stroke="var(--rule)" />
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad} x2={w} y1={h - f * (h - 10)} y2={h - f * (h - 10)} stroke="var(--rule-soft)" />
            <text x={0} y={h - f * (h - 10) + 4} fontSize="11" fill="var(--ink-3)">
              {Math.round(f * max)}
            </text>
          </g>
        ))}
        {years.map(([y, n], i) => {
          const bh = (n / max) * (h - 10);
          return (
            <g key={y} onMouseEnter={() => setHover(y)} onMouseLeave={() => setHover(null)}>
              <rect x={pad + i * bw} y={0} width={bw} height={h} fill="transparent" />
              <rect
                x={pad + i * bw + 1}
                y={h - bh}
                width={Math.max(1, bw - 2)}
                height={bh}
                rx={Math.min(2, bw / 4)}
                fill="var(--stamp)"
                opacity={hover === null || hover === y ? 1 : 0.45}
              />
            </g>
          );
        })}
        {ticks.map(([y]) => (
          <text key={y} x={pad + years.findIndex((t) => t[0] === y) * bw} y={h + 16} fontSize="11" fill="var(--ink-3)">
            {y}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function CorpusPage() {
  const { stats } = useService();
  const [profile, setProfile] = useState<Profile | null>(cache);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    loadProfile().then(setProfile).catch((e) => setError((e as Error).message));
  };
  useEffect(() => {
    if (!profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Corpus profile</h1>
          <p>
            What every search covers: {stats?.live_domain || "the loaded patent classes"}, from Google Patents Public Data (CC BY 4.0).
          </p>
        </div>
      </div>

      {stats && (
        <div className="stat-row panel-pad panel" style={{ marginBottom: 18 }}>
          <div>
            <b>{stats.patents.toLocaleString()}</b>
            <span>US utility patents</span>
          </div>
          <div>
            <b>{stats.by_status.in_force.toLocaleString()}</b>
            <span>In force (assumed from term)</span>
          </div>
          <div>
            <b>{(stats.by_status.expired + stats.by_status.lapsed).toLocaleString()}</b>
            <span>Expired or lapsed</span>
          </div>
          <div>
            <b>{profile ? profile.within2.toLocaleString() : "…"}</b>
            <span>Term ends within two years</span>
          </div>
        </div>
      )}

      {error && <ErrorNote error={error} onRetry={load} />}
      {!profile && !error && <Spinner label="Profiling the corpus…" />}

      {profile && (
        <div style={{ display: "grid", gap: 18 }}>
          <section className="panel">
            <div className="panel-head">
              <h2>Patents by filing year</h2>
            </div>
            <div className="panel-pad">
              <YearChart years={profile.years} />
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Most common CPC groups</h2>
              </div>
              <div className="panel-pad">
                <HBars rows={profile.groups} label="Patents per CPC group" />
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Most frequent assignees</h2>
                <span className="faint small">{profile.withAssignee.toLocaleString()} list one</span>
              </div>
              <div className="panel-pad">
                <HBars rows={profile.assignees} label="Patents per assignee" />
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>Next to leave patent term</h2>
              <span className="faint small">Worth watching: these claims open up soonest</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Patent</th>
                    <th>Assignee</th>
                    <th>Term ends</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.soon.map((p) => (
                    <tr key={p.id}>
                      <td><PatentRef p={p} /></td>
                      <td className="small">{p.assignee ?? <span className="faint">Not listed</span>}</td>
                      <td className="small nowrap">{fmtDate(p.expiry_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="notice">
            <div>
              <strong>Known gaps.</strong> The source has no maintenance-fee events, citations or abstracts for this class, so in-force status is
              assumed until the 20-year term ends, citation-based scores are zero, and search runs on titles and claims.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
