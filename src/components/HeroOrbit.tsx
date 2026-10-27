import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Everything Second Wind does, arranged around the founder's idea. The steps light up the tools each stage uses.
const NODES = [
  { label: "Idea check", to: "/app/check" },
  { label: "Blocking patents", to: "/app/check" },
  { label: "Prior art", to: "/app/check" },
  { label: "Patent expiry", to: "/app/expiry" },
  { label: "Opportunity scout", to: "/app/scout" },
  { label: "Patent search", to: "/app/research/search" },
  { label: "Corpus profile", to: "/app/research/corpus" },
  { label: "Attorney report", to: "/app/reports" },
];

// Step colors are light tints of the logo's three gusts, plus the brand periwinkle.
const STEPS = [
  { title: "Describe your idea", body: "Plain words in. Second Wind picks out the features and the vocabulary patents use.", nodes: [0], color: "#d3a6ea" },
  { title: "See what stands in the way", body: "In-force patents whose claims overlap, rated green, yellow or red and cited to the claim.", nodes: [1, 2], color: "#b5df7f" },
  { title: "Find what's opening up", body: "Patents near or past the end of their term, ranked by how promising they are to build on.", nodes: [3, 4], color: "#7cc3ee" },
  { title: "Dig in, then hand off", body: "Search the record yourself, then take a report to your patent attorney.", nodes: [5, 6, 7], color: "#aab4ff" },
];

const STEP_MS = 3800;
const R_NODE = 40; // % of the box, from the center
const R_CORE = 17;

const at = (i: number, r: number) => {
  const a = (i / NODES.length) * 2 * Math.PI - Math.PI / 2;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
};

export function HeroOrbit() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Stepping is a color change, so it runs even with reduced motion; the CSS drops the moving parts.
    if (paused) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [step, paused]);

  const cur = STEPS[step];
  return (
    <div
      className="orbit"
      style={{ ["--accent" as string]: cur.color }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="orbit-map">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R_NODE} className="ring" />
          <circle cx="50" cy="50" r={R_CORE + 4} className="ring" />
          {NODES.map((_, i) => {
            const a = at(i, R_CORE + 4);
            const b = at(i, R_NODE - 6);
            const on = cur.nodes.includes(i);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={on ? "spoke on" : "spoke"} />;
          })}
        </svg>
        <div className="core" key={step}>
          <span>Your idea</span>
        </div>
        {NODES.map((n, i) => {
          const p = at(i, R_NODE);
          const on = cur.nodes.includes(i);
          return (
            <Link
              key={n.label}
              to={n.to}
              className={on ? "node on" : "node"}
              style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${0.25 + i * 0.07}s` }}
            >
              {n.label}
            </Link>
          );
        })}
      </div>

      <ol className="orbit-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={i === step ? "on" : ""}>
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}>
              <span className="n" style={i === step ? { background: s.color } : undefined}>
                {i + 1}
              </span>
              <span className="t">{s.title}</span>
            </button>
            {i === step && <p>{s.body}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
