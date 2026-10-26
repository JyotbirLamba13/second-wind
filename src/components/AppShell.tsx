import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api, type Health, type Stats } from "../lib/api";
import { acknowledge, hasAcknowledged } from "../lib/local";
import { Brand, Icons } from "./ui";

interface Service {
  health: Health | null;
  stats: Stats | null;
  down: boolean;
}
const ServiceCtx = createContext<Service>({ health: null, stats: null, down: false });
export const useService = () => useContext(ServiceCtx);

const NAV = [
  { group: "Triage", items: [
    { to: "/app/check", label: "Idea check", icon: Icons.check },
    { to: "/app/scout", label: "Opportunity scout", icon: Icons.scout },
  ] },
  { group: "Research", items: [
    { to: "/app/research/search", label: "Patent search", icon: Icons.search },
    { to: "/app/research/browse", label: "Browse corpus", icon: Icons.browse },
    { to: "/app/research/corpus", label: "Corpus profile", icon: Icons.corpus },
    { to: "/app/research/benchmark", label: "Retrieval benchmark", icon: Icons.bench },
  ] },
  { group: "Library", items: [{ to: "/app/reports", label: "Saved reports", icon: Icons.reports }] },
];

const TITLES: [string, string][] = [
  ["/app/check", "Idea check"],
  ["/app/scout", "Opportunity scout"],
  ["/app/research/search", "Patent search"],
  ["/app/research/browse", "Browse corpus"],
  ["/app/research/corpus", "Corpus profile"],
  ["/app/research/benchmark", "Retrieval benchmark"],
  ["/app/reports", "Saved reports"],
  ["/app/patents", "Patent record"],
];

function AckGate({ onDone }: { onDone: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="ack-title">
      <div className="modal">
        <h2 id="ack-title">Before you start</h2>
        <p className="muted" style={{ marginTop: 10 }}>
          Second Life is a first layer of patent research. Please read this once.
        </p>
        <ul>
          <li>Results are automated triage over a limited corpus, not a legal opinion on patentability, infringement or freedom to operate.</li>
          <li>Ratings compare words in your description with patent claims. They can miss relevant patents and flag irrelevant ones.</li>
          <li>Ideas outside the live coffee-maker class use AI-generated mock patents, which are labeled and must not be relied on.</li>
          <li>Talk to a registered patent attorney or agent before you file, launch or invest.</li>
        </ul>
        <label>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I understand Second Life is not legal advice and I'll consult a patent attorney before relying on its results.</span>
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <Link to="/legal" className="btn ghost">
            Read the full explanation
          </Link>
          <button
            className="btn"
            disabled={!ok}
            onClick={() => {
              acknowledge();
              onDone();
            }}
          >
            Continue to workspace
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [svc, setSvc] = useState<Service>({ health: null, stats: null, down: false });
  const [acked, setAcked] = useState(hasAcknowledged());
  const [menu, setMenu] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    Promise.all([api.health(), api.stats()])
      .then(([health, stats]) => setSvc({ health, stats, down: false }))
      .catch(() => setSvc({ health: null, stats: null, down: true }));
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [loc.pathname]);

  const title = TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1] ?? "Workspace";

  return (
    <ServiceCtx.Provider value={svc}>
      <div className="shell">
        <aside className={`side ${menu ? "open" : ""}`} aria-label="Workspace">
          <Brand />
          {NAV.map((g) => (
            <div className="side-group" key={g.group}>
              <h4>{g.group}</h4>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to}>
                  <it.icon />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="side-foot">
            <p>Research triage only. Not legal advice.</p>
            <p style={{ marginTop: 6 }}>
              <Link to="/legal">Limits of this tool</Link>
            </p>
          </div>
        </aside>
        <div>
          <header className="topbar">
            <button className="btn ghost sm menu-btn" onClick={() => setMenu(!menu)} aria-label="Open navigation" aria-expanded={menu}>
              <Icons.menu />
            </button>
            <span className="crumb">{title}</span>
            <span className="spacer" />
            <span className="ds">
              {svc.down ? (
                <span>
                  <span className="dot" />
                  Research service unreachable
                </span>
              ) : svc.stats ? (
                <>
                  <span>
                    <span className="dot on" />
                    {svc.stats.patents.toLocaleString()} patents, {svc.stats.live_subclasses?.join(", ") || "mixed classes"}
                  </span>
                  <span title={svc.health?.llm_enabled ? "AI idea reading and follow-up chat are on" : "No AI model configured: idea reading uses your exact words"}>
                    <span className={`dot ${svc.health?.llm_enabled ? "on" : ""}`} />
                    AI {svc.health?.llm_enabled ? "on" : "off"}
                  </span>
                </>
              ) : (
                <span>Connecting… first load can take a few seconds</span>
              )}
            </span>
            <Link to="/legal" className="legal-pill">
              Not legal advice
            </Link>
          </header>
          <main>
            <Outlet />
          </main>
        </div>
      </div>
      {!acked && <AckGate onDone={() => setAcked(true)} />}
    </ServiceCtx.Provider>
  );
}
