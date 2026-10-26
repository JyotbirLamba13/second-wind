import { Link } from "react-router-dom";
import type { Level, PatentSummary } from "../lib/api";

export const USPTO_ROSTER = "https://oedci.uspto.gov/OEDCI/";
export const USPTO_PRO_BONO = "https://www.uspto.gov/patents/basics/using-legal-services/pro-bono/patent-pro-bono-program";
export const USPTO_CLINICS =
  "https://www.uspto.gov/learning-and-resources/ip-policy/public-information-about-practitioners/law-school-clinic-1";

export function Mark({ size = 26 }: { size?: number }) {
  // A claim bracket around a sprouting leaf: a patent given a second life.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--ink)" />
      <path d="M10 8H7v16h3M22 8h3v16h-3" stroke="var(--paper)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M16 23V14" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16c0-4 2.5-6 6-6 0 4-2.5 6-6 6zM16 18c0-3-2-4.5-4.5-4.5 0 3 2 4.5 4.5 4.5z" fill="var(--paper)" />
    </svg>
  );
}

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand">
      <Mark />
      Second Life
    </Link>
  );
}

const STATUS_LABEL: Record<string, string> = { in_force: "In force", lapsed: "Lapsed", expired: "Expired" };

export function StatusTag({ p }: { p: Pick<PatentSummary, "status" | "mock" | "fee_data"> }) {
  if (p.mock) return <span className="status mock">Mock</span>;
  return (
    <span className={`status ${p.status}`} title={!p.fee_data && p.status === "in_force" ? "Assumed in force: no maintenance fee data is loaded" : undefined}>
      {STATUS_LABEL[p.status]}
      {!p.fee_data && p.status === "in_force" ? "*" : ""}
    </span>
  );
}

const LEVEL_LABEL: Record<Level, string> = { green: "Green", yellow: "Yellow", red: "Red" };
export const LEVEL_MEANING: Record<Level, string> = {
  green: "Clear in this corpus",
  yellow: "Overlap to resolve",
  red: "Strong overlap",
};

export function Triage({ level, label }: { level: Level; label?: string }) {
  return <span className={`triage ${level}`}>{label ?? LEVEL_LABEL[level]}</span>;
}

export function Meter({ value, level }: { value: number; level?: Level }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`meter ${level ?? ""}`} role="img" aria-label={`${Math.round(w)} percent`}>
      <i style={{ width: `${w}%` }} />
    </div>
  );
}

export function PatentRef({ p, title = true }: { p: Pick<PatentSummary, "id" | "title" | "mock">; title?: boolean }) {
  if (p.mock) {
    return (
      <span>
        <span className="pid">{p.id}</span>
        {title && <span className="ttl"> {p.title}</span>}
      </span>
    );
  }
  return (
    <span>
      <Link className="pid" to={`/app/patents/${encodeURIComponent(p.id)}`}>
        {p.id}
      </Link>
      {title && <span className="ttl"> {p.title}</span>}
    </span>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="faint small" role="status">
      <span className="spinner" /> {label}
    </span>
  );
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <div>
        <strong>That didn't work.</strong> {error}
        {onRetry && (
          <div style={{ marginTop: 10 }}>
            <button className="btn sm ghost" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LegalNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="notice legal">
      <div>
        <strong>Research triage, not legal advice.</strong>{" "}
        {compact
          ? "Results cover only the indexed corpus. Consult a registered patent attorney before relying on them."
          : "Second Life searches a limited patent corpus and scores word overlap with claims. It cannot tell you whether you can patent your idea or whether a product infringes. Before you file, launch or invest, have a registered patent attorney or agent review your situation."}{" "}
        <Link to="/legal">What this means</Link>
      </div>
    </div>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function firstClaim(claims: string[] | undefined, max = 260) {
  const c = (claims?.[0] ?? "").replace(/\s+/g, " ").trim();
  return c.length > max ? c.slice(0, max).trimEnd() + "…" : c;
}

const icon = (d: string) =>
  function Icon() {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    );
  };
export const Icons = {
  check: icon("M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"),
  scout: icon("M12 21c4.5-4 7-7.5 7-11a7 7 0 10-14 0c0 3.5 2.5 7 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"),
  search: icon("M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3"),
  browse: icon("M4 5h16M4 10h16M4 15h10M4 20h7"),
  corpus: icon("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  bench: icon("M3 12h4l3-8 4 16 3-8h4"),
  reports: icon("M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"),
  legal: icon("M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0zM8 21h8"),
  menu: icon("M4 6h16M4 12h16M4 18h16"),
};
