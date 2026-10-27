import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api, type Health, type Stats } from "../lib/api";
import { acknowledge, aiPreferred, hasAcknowledged, preferAi } from "../lib/local";
import { Brand, Icons } from "./ui";

interface Service {
  health: Health | null;
  stats: Stats | null;
  down: boolean;
  // AI is used only when the server has a model and the visitor hasn't switched it off.
  ai: boolean;
}
const ServiceCtx = createContext<Service>({ health: null, stats: null, down: false, ai: false });
export const useService = () => useContext(ServiceCtx);

const NAV = [
  { group: "Check", items: [
    { to: "/app/check", label: "Idea check", icon: Icons.check },
    { to: "/app/expiry", label: "Patent expiry", icon: Icons.expiry },
    { to: "/app/scout", label: "Opportunity scout", icon: Icons.scout },
  ] },
  { group: "Research", items: [
    { to: "/app/research/search", label: "Patent search", icon: Icons.search },
    { to: "/app/research/corpus", label: "Corpus profile", icon: Icons.corpus },
  ] },
  { group: "Library", items: [{ to: "/app/reports", label: "Saved reports", icon: Icons.reports }] },
];

const TITLES: [string, string][] = [
  ["/app/check", "Idea check"],
  ["/app/expiry", "Patent expiry"],
  ["/app/scout", "Opportunity scout"],
  ["/app/research/search", "Patent search"],
  ["/app/research/corpus", "Corpus profile"],
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
          Second Wind is a first layer of patent research. Please read this once.
        </p>
        <ul>
          <li>Results are automated first-pass research over a limited corpus, not a legal opinion on patentability, infringement or freedom to operate.</li>
          <li>Ratings compare words in your description with patent claims. They can miss relevant patents and flag irrelevant ones.</li>
          <li>Ideas outside the live coffee-maker class use AI-generated mock patents, which are labeled and must not be relied on.</li>
          <li>Talk to a registered patent attorney or agent before you file, launch or invest.</li>
        </ul>
        <label>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I understand Second Wind is not legal advice and I'll consult a patent attorney before relying on its results.</span>
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
  const [svc, setSvc] = useState<Omit<Service, "ai">>({ health: null, stats: null, down: false });
  const [aiOn, setAiOn] = useState(aiPreferred());
  const ai = !!svc.health?.llm_enabled && aiOn;
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
    <ServiceCtx.Provider value={{ ...svc, ai }}>
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
            <p>First-pass research only. Not legal advice.</p>
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
                  {svc.health?.llm_enabled ? (
                    <button
                      type="button"
                      className="ai-toggle"
                      aria-pressed={ai}
                      title={ai ? "AI reads your idea and answers follow-ups. Switch off to keep your idea away from any AI model." : "AI is off: your idea never reaches an AI model. Reading and answers use rules only."}
                      onClick={() => {
                        preferAi(!aiOn);
                        setAiOn(!aiOn);
                      }}
                    >
                      <span className={`dot ${ai ? "on" : ""}`} />
                      AI {ai ? "on" : "off"}
                    </button>
                  ) : (
                    <span title="No AI model configured: idea reading uses your exact words">
                      <span className="dot" />
                      AI off
                    </span>
                  )}
                </>
              ) : (
                <span>Starting the research service… this can take up to 30 seconds after a quiet spell</span>
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
