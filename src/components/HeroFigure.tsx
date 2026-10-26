import { useState } from "react";
import { Link } from "react-router-dom";

// Real result of the cold brew example against the live A47J31 corpus (run 26 Oct 2026).
const PARTS = [
  {
    ref: "10",
    name: "Brewing vessel",
    finding: "Shared by nearly every patent in the class, so it carries little weight in the overlap score.",
    leader: "M372 112 C350 112 338 124 318 132",
    at: [380, 116],
  },
  {
    ref: "12",
    name: "Ultrasonic transducer",
    finding: "Matched in claim 1 of US12733766B2, Extractor for cold brew coffee and the likes. In force until Sep 2043.",
    leader: "M372 300 C352 300 346 296 332 295",
    at: [380, 304],
  },
  {
    ref: "14",
    name: "Grounds slurry",
    finding: "Matched in US11793347B2, Magnetically driven beverage brewing system and method. In force until Nov 2042.",
    leader: "M126 246 C150 246 170 240 206 238",
    at: [104, 250],
  },
  {
    ref: "18",
    name: "Chilled water feed",
    finding: "Cold extraction is claimed in US10517314B2, Cold-brew coffee brewing system. 24% claim overlap, in force.",
    leader: "M52 204 C60 190 70 182 84 172",
    at: [38, 216],
  },
];

export function HeroFigure() {
  const [active, setActive] = useState("12");
  const part = PARTS.find((p) => p.ref === active)!;
  return (
    <figure className="figure" style={{ margin: 0 }}>
      <svg viewBox="0 0 440 340" role="img" aria-labelledby="fig1-title">
        <title id="fig1-title">Patent-style drawing of a cold brew rig with four numbered components</title>
        <defs>
          <clipPath id="slurry">
            <path d="M192 192 H318 V266 Q318 280 304 280 H206 Q192 280 192 266 Z" />
          </clipPath>
          <pattern id="water" width="12" height="9" patternUnits="userSpaceOnUse">
            <path d="M0 5 q3 -3 6 0 t6 0" className="ink-thin" />
          </pattern>
        </defs>

        {/* 18: reservoir and feed tube */}
        <rect x="48" y="62" width="92" height="108" rx="4" className="ink" />
        <rect x="52" y="96" width="84" height="70" fill="url(#water)" />
        <path d="M48 96 H140" className="ink-thin" />
        <path d="M140 84 H168 Q178 84 178 74 V52 Q178 44 186 44 H222 Q230 44 230 52 V74" className="ink" />
        <path d="M140 90 H172" className="ink-thin" strokeDasharray="3 3" />

        {/* 10: vessel and lid */}
        <path d="M192 74 V266 Q192 280 206 280 H304 Q318 280 318 266 V74" className="ink" />
        <path d="M184 74 H326" className="ink" />
        <rect x="236" y="62" width="38" height="12" rx="2" className="ink" />
        <path d="M200 84 V266" className="ink-thin" />
        {/* 14: slurry, hatched */}
        <path d="M192 192 H318" className="ink" />
        <g clipPath="url(#slurry)">
          {Array.from({ length: 22 }, (_, i) => (
            <path key={i} d={`M${170 + i * 9} 282 L${210 + i * 9} 190`} className="hatch" />
          ))}
        </g>
        {/* tap */}
        <path d="M318 246 H342 V256 H330 V266" className="ink" />

        {/* 12: transducer and wave fronts */}
        <rect x="186" y="284" width="138" height="20" rx="3" className="ink" />
        <path d="M206 294 H304" className="ink-thin" strokeDasharray="6 4" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${232 - i * 10} ${272 - i * 9} Q255 ${262 - i * 12} ${278 + i * 10} ${272 - i * 9}`} className="ink-thin" />
        ))}
        <rect x="170" y="304" width="170" height="14" rx="2" className="ink" />

        {PARTS.map((p) => (
          <g
            key={p.ref}
            className="part"
            data-active={p.ref === active}
            onClick={() => setActive(p.ref)}
          >
            <path d={p.leader} className="lead draw" />
            <text x={p.at[0]} y={p.at[1]} className="num">
              {p.ref}
            </text>
            <circle cx={p.at[0] + 8} cy={p.at[1] - 5} r="14" className="num-hit" />
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="figlabel">Fig. 1</span>
        <span className="faint small">A real check against the live coffee-maker corpus</span>
      </figcaption>
      <div className="legend" aria-live="polite">
        <div className="row">
          <span className="ref">{part.ref}</span>
          <div>
            <b>{part.name}</b>
            <p className="muted small" style={{ marginTop: 2 }}>
              {part.finding}
            </p>
          </div>
        </div>
        <div className="tabs" role="group" aria-label="Components">
          {PARTS.map((p) => (
            <button key={p.ref} aria-pressed={p.ref === active} onClick={() => setActive(p.ref)} aria-label={`${p.ref}, ${p.name}`}>
              {p.ref}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <Link to="/app/check?example=coldbrew" className="small" style={{ fontWeight: 600 }}>
            Run this check
          </Link>
        </div>
      </div>
    </figure>
  );
}
