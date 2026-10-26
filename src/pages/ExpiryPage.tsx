import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useService } from "../components/AppShell";
import { ErrorNote, ExternalLink, LegalNotice, PatentRef, Spinner, StatusTag, fmtDate } from "../components/ui";
import { ApiError, api, type PatentDetail, type PatentSummary } from "../lib/api";
import { savedReports } from "../lib/local";

type Tab = "soon" | "recent";
const WINDOWS = [
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
  { months: 60, label: "5 years" },
];
const PAGE = 50;

const iso = (d: Date) => d.toISOString().slice(0, 10);
function shift(today: string, months: number) {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return iso(d);
}

/** "in 4 months", "2 years ago": distance from today to a term end, in the unit a reader scans for. */
function relative(date: string, today: string) {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  if (days === 0) return "today";
  const abs = Math.abs(days);
  const amount =
    abs < 45 ? `${abs} day${abs === 1 ? "" : "s"}` : abs < 730 ? `${Math.round(abs / 30.4)} months` : `${(abs / 365.25).toFixed(1)} years`;
  return days >= 0 ? `in ${amount}` : `${amount} ago`;
}

/** Patent numbers arrive as "10,517,314", "US 10517314 B2", "us10517314"; ids in the corpus look like US10517314B2. */
function candidates(raw: string): string[] {
  const s = raw.toUpperCase().replace(/[\s,.-]/g, "");
  const m = s.match(/^(US)?(RE|D|PP)?(\d+)([A-Z]\d?)?$/);
  if (!m) return [];
  const base = `US${m[2] ?? ""}${m[3]}`;
  return m[4] ? [base + m[4]] : ["B2", "B1", "E", "A", "S"].map((k) => base + k);
}

async function lookup(raw: string): Promise<PatentDetail | null> {
  for (const id of candidates(raw)) {
    try {
      return await api.patent(id);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
  }
  return null;
}

function ExpiryRow({ p, today, rank }: { p: PatentSummary; today: string; rank?: number }) {
  return (
    <tr>
      {rank !== undefined && <td className="num faint">{rank}</td>}
      <td style={{ minWidth: 280 }}>
        <PatentRef p={p} />
        <div className="faint small">{p.assignee ?? "No assignee listed"}</div>
      </td>
      <td><StatusTag p={p} /></td>
      <td className="small nowrap">{fmtDate(p.expiry_date)}</td>
      <td className="small nowrap" style={{ fontWeight: 600 }}>
        {relative(p.expiry_date, today)}
      </td>
    </tr>
  );
}

function LookupCard({ p, today }: { p: PatentDetail; today: string }) {
  const ended = p.expiry_date < today;
  return (
    <section className="panel panel-pad" style={{ display: "grid", gap: 14 }}>
      <div className="item-head" style={{ padding: 0 }}>
        <PatentRef p={p} />
        <StatusTag p={p} />
      </div>
      <div className="stat-row" style={{ borderTopWidth: 1 }}>
        <div>
          <b style={{ fontSize: "1.5rem" }}>{fmtDate(p.expiry_date)}</b>
          <span>Estimated term end</span>
        </div>
        <div>
          <b style={{ fontSize: "1.5rem" }}>{relative(p.expiry_date, today)}</b>
          <span>{ended ? "Since the term ended" : "Until the term ends"}</span>
        </div>
        <div>
          <b style={{ fontSize: "1.5rem" }}>{fmtDate(p.filing_date)}</b>
          <span>Filed</span>
        </div>
        <div>
          <b style={{ fontSize: "1.5rem" }}>{fmtDate(p.grant_date)}</b>
          <span>Granted</span>
        </div>
      </div>
      <p className="muted small">
        Estimated as 20 years from the filing date. Not included: patent term adjustment or extension (can push the date later), terminal
        disclaimers and unpaid maintenance fees (can end it earlier), and earlier priority claims. Confirm in USPTO Patent Center before relying on
        it.
      </p>
      <p className="small" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link to={`/app/patents/${encodeURIComponent(p.id)}`}>Read claims and dates</Link>
        <ExternalLink href={p.url}>Open on Google Patents</ExternalLink>
      </p>
    </section>
  );
}

export function ExpiryPage() {
  const { stats } = useService();
  const [params, setParams] = useSearchParams();
  const today = stats?.as_of ?? iso(new Date());
  const lastIdea = savedReports()[0]?.idea;

  const [mode, setMode] = useState<"idea" | "number">(params.get("number") ? "number" : "idea");
  const [draft, setDraft] = useState(params.get("number") ?? params.get("q") ?? "");
  const [idea, setIdea] = useState(params.get("q") ?? "");
  const [tab, setTab] = useState<Tab>("soon");
  const [months, setMonths] = useState(24);
  const [rows, setRows] = useState<PatentSummary[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [found, setFound] = useState<PatentDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The lists: the whole corpus by date, or the idea's 100 closest patents filtered to the same window.
  useEffect(() => {
    if (!stats) return;
    let live = true;
    const [after, before] = tab === "soon" ? [today, shift(today, months)] : [shift(today, -months), today];
    setBusy(true);
    setError("");
    const load = idea
      ? api.search({ query: idea, k: 100, mode: "hybrid" }).then((hits) =>
          hits
            .map((h) => h.patent)
            .filter((p) => p.status === (tab === "soon" ? "in_force" : "expired") && p.expiry_date >= after && p.expiry_date <= before)
            .sort((a, b) => (tab === "soon" ? a.expiry_date.localeCompare(b.expiry_date) : b.expiry_date.localeCompare(a.expiry_date))),
        )
      : api.patents({ status: tab === "soon" ? "in_force" : "expired", expires_after: after, expires_before: before, sort: tab === "soon" ? "expiry" : "-expiry", limit: PAGE, offset });
    load
      .then((r) => live && setRows(r))
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [stats, idea, tab, months, offset, today]);

  useEffect(() => {
    const n = params.get("number");
    if (n) runLookup(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runLookup(raw: string) {
    if (!candidates(raw).length) {
      setError("That doesn't look like a US patent number. Try a form like 10,517,314 or US10517314B2.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setFound(await lookup(raw));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(text = draft) {
    const v = text.trim();
    if (mode === "number") {
      setParams({ number: v }, { replace: true });
      runLookup(v);
      return;
    }
    if (v && v.length < 3) {
      setError("Describe the idea in a few words, or clear the box to see the whole corpus.");
      return;
    }
    setFound(undefined);
    setOffset(0);
    setIdea(v);
    setParams(v ? { q: v } : {}, { replace: true });
  }

  const windowLabel = WINDOWS.find((w) => w.months === months)!.label;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Patent expiry</h1>
          <p>
            When a patent's term ends, anyone can build what it claims. Describe your idea to see related patents expiring soon or recently
            expired, or look up one patent's term.
          </p>
        </div>
      </div>

      <form
        className="panel panel-pad"
        style={{ display: "grid", gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="chips" role="group" aria-label="Search by">
          <button type="button" className="chip" aria-pressed={mode === "idea"} onClick={() => setMode("idea")}>
            Around an idea
          </button>
          <button type="button" className="chip" aria-pressed={mode === "number"} onClick={() => setMode("number")}>
            Look up a patent number
          </button>
        </div>
        <div className="toolbar">
          <label className="field grow">
            <span className="visually-hidden">{mode === "idea" ? "Your idea" : "Patent number"}</span>
            <input
              className="input"
              style={{ fontSize: "1.0625rem", padding: "12px 14px" }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={mode === "idea" ? "A cold brew maker that uses ultrasound to speed up extraction" : "10,517,314 or US10517314B2"}
            />
          </label>
          <button className="btn" disabled={busy}>
            {mode === "idea" ? "Find related patents" : "Look up"}
          </button>
        </div>
        {mode === "idea" && (
          <p className="faint small">
            {idea ? (
              <>
                Showing patents related to your idea.{" "}
                <button type="button" className="linklike" onClick={() => { setDraft(""); submit(""); }}>
                  Show the whole corpus instead
                </button>
              </>
            ) : lastIdea ? (
              <>
                Showing the whole corpus.{" "}
                <button type="button" className="linklike" onClick={() => { setDraft(lastIdea); submit(lastIdea); }}>
                  Use the idea from your last check
                </button>
              </>
            ) : (
              "Showing the whole corpus. Describe an idea to narrow it to related patents."
            )}
          </p>
        )}
      </form>

      <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
        {error && <ErrorNote error={error} />}

        {mode === "number" && found === null && (
          <div className="notice warn">
            <div>
              <strong>Not in the corpus.</strong> Only the {stats?.patents.toLocaleString() ?? ""} indexed patents can be looked up, currently{" "}
              {stats?.live_domain || "one CPC class"}. Check other patents in USPTO Patent Center.
            </div>
          </div>
        )}
        {mode === "number" && found && <LookupCard p={found} today={today} />}

        <section className="panel">
          <div className="panel-head" style={{ flexWrap: "wrap" }}>
            <div className="chips" role="tablist">
              <button type="button" role="tab" className="chip" aria-pressed={tab === "soon"} aria-selected={tab === "soon"} onClick={() => { setTab("soon"); setOffset(0); }}>
                Expiring soon
              </button>
              <button type="button" role="tab" className="chip" aria-pressed={tab === "recent"} aria-selected={tab === "recent"} onClick={() => { setTab("recent"); setOffset(0); }}>
                Recently expired
              </button>
            </div>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {tab === "soon" ? "Ending within" : "Ended in the last"}
              <select className="select" style={{ width: "auto" }} value={months} onChange={(e) => { setMonths(Number(e.target.value)); setOffset(0); }}>
                {WINDOWS.map((w) => (
                  <option key={w.months} value={w.months}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!rows && busy && (
            <div className="panel-pad">
              <Spinner label="Loading patents…" />
            </div>
          )}
          {rows && rows.length === 0 && (
            <p className="panel-pad muted">
              {idea
                ? `None of the 100 patents closest to your idea ${tab === "soon" ? "end" : "ended"} ${tab === "soon" ? "within" : "in the last"} ${windowLabel}. Try a longer window.`
                : "No patents in this window. Try a longer one."}
            </p>
          )}
          {rows && rows.length > 0 && (
            <div className="table-wrap" style={{ opacity: busy ? 0.55 : 1 }}>
              <table className="data">
                <thead>
                  <tr>
                    {!idea && <th className="num">#</th>}
                    <th>Patent</th>
                    <th>Status</th>
                    <th>Term ends</th>
                    <th>{tab === "soon" ? "Ends" : "Ended"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => (
                    <ExpiryRow key={p.id} p={p} today={today} rank={idea ? undefined : offset + i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!idea && rows && (offset > 0 || rows.length === PAGE) && (
            <div className="panel-pad" style={{ display: "flex", gap: 8, borderTop: "1px solid var(--rule-soft)" }}>
              <button className="btn ghost sm" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Previous
              </button>
              <button className="btn ghost sm" disabled={rows.length < PAGE || busy} onClick={() => setOffset(offset + PAGE)}>
                Next
              </button>
            </div>
          )}
        </section>

        <div className="notice">
          <div>
            <strong>Dates are estimates.</strong> Term ends are 20 years from filing. Term adjustments or extensions can make a patent last longer, and
            unpaid maintenance fees or terminal disclaimers can end it sooner. A related patent that is still in force may also cover the same
            technology.
          </div>
        </div>
        <LegalNotice compact />
      </div>
    </div>
  );
}
