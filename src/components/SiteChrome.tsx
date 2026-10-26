import { Link } from "react-router-dom";
import { Brand, USPTO_PRO_BONO, USPTO_ROSTER } from "./ui";

export function SiteNav() {
  return (
    <header className="site-nav">
      <div className="wrap">
        <Brand />
        <nav aria-label="Site">
          <a href="/#product">Product</a>
          <a href="/#how">How it works</a>
          <a href="/#teams">For teams</a>
          <a href="/#coverage">Coverage</a>
          <a href="/#plans">Plans</a>
        </nav>
        <span className="spacer" />
        <Link to="/app/check" className="btn sm">
          Open workspace
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div>
          <p>
            <strong style={{ color: "var(--ink)" }}>Second Life provides automated first-pass patent research, not legal advice.</strong> Results
            cover only the indexed corpus and can be incomplete or wrong. No attorney-client relationship is created by using this service.
            Consult a registered patent attorney or agent before making decisions.
          </p>
          <p style={{ marginTop: 12 }}>
            Patent data: Google Patents Public Data, licensed CC BY 4.0. Demo build.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <Link to="/app/check">Idea check</Link>
          <Link to="/app/scout">Opportunity scout</Link>
          <Link to="/app/research/search">Research workspace</Link>
          <Link to="/app/research/corpus">Corpus coverage</Link>
        </div>
        <div>
          <h4>Legal</h4>
          <Link to="/legal">Not legal advice</Link>
          <a href={USPTO_ROSTER} target="_blank" rel="noreferrer">
            Find a registered practitioner
          </a>
          <a href={USPTO_PRO_BONO} target="_blank" rel="noreferrer">
            USPTO Patent Pro Bono Program
          </a>
        </div>
      </div>
    </footer>
  );
}
