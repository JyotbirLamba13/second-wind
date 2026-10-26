import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeroFigure } from "../components/HeroFigure";
import { USPTO_CLINICS, USPTO_PRO_BONO, USPTO_ROSTER } from "../components/ui";
import { SiteFooter, SiteNav } from "../components/SiteChrome";
import { api, type Stats } from "../lib/api";

const STEPS = [
  {
    title: "Read the idea",
    body: "You describe the product in plain words. An AI model turns it into the features and vocabulary patents use, plus likely CPC classes.",
  },
  {
    title: "Search the corpus",
    body: "Keyword (BM25), embedding and CPC-class rankings are fused into one list of the 25 closest patents.",
  },
  {
    title: "Score claim overlap",
    body: "Each candidate's first independent claim is compared term by term with your idea, weighted by how distinctive each term is.",
  },
  {
    title: "Rate and hand off",
    body: "You get green, yellow or red for novelty and for blocking risk, the riskiest assumption as a two-week test, and a packet for an attorney.",
  },
];

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);
  const n = stats?.patents ?? 5444;
  const inForce = stats?.by_status.in_force ?? 4465;
  const expired = (stats?.by_status.expired ?? 979) + (stats?.by_status.lapsed ?? 0);

  return (
    <div className="site">
      <SiteNav />
      <main>
        <section className="hero">
          <div className="wrap">
            <div>
              <h1>See which patents stand in your way before you build.</h1>
              <p className="lede">
                Second Life gives founders, inventors and the programs that back them a first-pass patent read in about a minute: how
                novel an idea looks, which in-force patents could block it, and which expired ones are free to build on.
              </p>
              <div className="ctas">
                <Link to="/app/check" className="btn">
                  Check an idea
                </Link>
                <Link to="/app/research/search" className="btn ghost">
                  Explore the research workspace
                </Link>
              </div>
              <p className="fine">
                First-layer research only. Second Life does not give legal advice; it prepares you for the conversation with a registered
                patent attorney.
              </p>
            </div>
            <HeroFigure />
          </div>
        </section>

        <div className="legal-strip">
          <div className="wrap">
            <strong>Not legal advice.</strong>
            <span>
              Every report states its limits, cites the patents behind each statement and recommends an attorney when an in-force patent
              overlaps. <Link to="/legal">Read how we frame results</Link>
            </span>
          </div>
        </div>

        <section className="section" id="product">
          <div className="wrap">
            <h2>Three ways into the patent record</h2>
            <p className="intro">One retrieval engine sits under all three, so a question in one mode can be followed up in another.</p>
            <div className="modes">
              <div className="mode">
                <h3>Idea check</h3>
                <p>Describe a product and get a report you can act on the same day.</p>
                <ul>
                  <li>Novelty and blocking-risk ratings</li>
                  <li>Possible blockers with the terms that overlap</li>
                  <li>Follow-up chat and design-change re-checks</li>
                  <li>Downloadable prior-art packet</li>
                </ul>
                <Link to="/app/check">Open idea check</Link>
              </div>
              <div className="mode">
                <h3>Opportunity scout</h3>
                <p>Rank expired and lapsed patents by how promising they are to build on again.</p>
                <ul>
                  <li>0–100 score with the reasons behind it</li>
                  <li>Similar in-force patents to clear first</li>
                  <li>Activity in the class since the lapse</li>
                  <li>Patents around your idea that expire soon</li>
                </ul>
                <Link to="/app/scout">Open scout</Link>
              </div>
              <div className="mode">
                <h3>Research workspace</h3>
                <p>Work the corpus directly, the way an analyst would.</p>
                <ul>
                  <li>Search with four ranking methods side by side</li>
                  <li>Browse by legal status and CPC class</li>
                  <li>Full claims, family and term dates</li>
                  <li>Corpus profile: what the data covers</li>
                </ul>
                <Link to="/app/research/search">Open research</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <h2>What happens when you check an idea</h2>
            <p className="intro">Every statement in a report links back to the patent and claim it came from, so nothing has to be taken on trust.</p>
            <div className="steps">
              {STEPS.map((s, i) => (
                <div className="step" key={s.title}>
                  <span className="n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="teams">
          <div className="wrap">
            <h2>Built for the people who back new products</h2>
            <p className="intro">
              Most first-time founders meet patents too late, after the build or the raise. Second Life moves that first look to week one,
              and gives advisors a consistent starting point.
            </p>
            <div className="audiences">
              <div className="aud">
                <h3>Accelerators and incubators</h3>
                <p className="who">Program directors, venture partners, mentors</p>
                <p>Screen every cohort idea for obvious patent exposure before you commit mentoring hours or capital.</p>
                <ul>
                  <li>The same method for every team</li>
                  <li>Packets mentors can review in minutes</li>
                </ul>
              </div>
              <div className="aud">
                <h3>University IP clinics and tech transfer</h3>
                <p className="who">Clinic supervisors, licensing officers</p>
                <p>Arrive at the first student consult with the closest prior art already gathered and cited.</p>
                <ul>
                  <li>Claim-level overlap, not just keyword hits</li>
                  <li>Clear handoff point to licensed counsel</li>
                </ul>
              </div>
              <div className="aud">
                <h3>Product and R&amp;D teams</h3>
                <p className="who">Product leads, engineers, designers</p>
                <p>Check a design change against in-force claims while it's still cheap to change.</p>
                <ul>
                  <li>Re-check a revised design in one message</li>
                  <li>See which claim elements you avoid</li>
                </ul>
              </div>
              <div className="aud">
                <h3>Founders and inventors</h3>
                <p className="who">Students, first-time builders, independent inventors</p>
                <p>Learn what patents in your space actually claim, and what your riskiest assumption is.</p>
                <ul>
                  <li>Plain-language explanations</li>
                  <li>A two-week test for the riskiest assumption</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="coverage">
          <div className="wrap">
            <h2>What the corpus covers today</h2>
            <div className="coverage">
              <div className="facts">
                <div className="fact">
                  <b>{n.toLocaleString()}</b>
                  <span>US utility patents indexed</span>
                </div>
                <div className="fact">
                  <b>A47J31</b>
                  <span>Coffee and beverage-making apparatus</span>
                </div>
                <div className="fact">
                  <b>{inForce.toLocaleString()}</b>
                  <span>In force, by 20-year term</span>
                </div>
                <div className="fact">
                  <b>{expired.toLocaleString()}</b>
                  <span>Expired and free to build on</span>
                </div>
              </div>
              <div className="muted" style={{ display: "grid", gap: 14 }}>
                <p>
                  Live results come from Google Patents Public Data (CC BY 4.0). The engine loads any CPC class from the same source, so new
                  industries are a data load, not a rebuild.
                </p>
                <p>
                  For ideas outside the live class, the demo generates a small set of fictional patents so you can see the full workflow. Those
                  reports carry a banner and every mock patent is labeled. Never rely on them.
                </p>
                <p>
                  Maintenance-fee records aren't loaded yet, so a patent counts as in force until its term ends. Some may already have lapsed
                  for unpaid fees.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="plans">
          <div className="wrap">
            <h2>Plans</h2>
            <p className="intro">This is a demo build. Items marked planned are on the roadmap and not in the product yet.</p>
            <div className="plans">
              <div className="plan">
                <h3>Founder</h3>
                <div className="price">Free</div>
                <p className="for">For one founder testing ideas</p>
                <ul>
                  <li>Idea checks and follow-up chat</li>
                  <li>Prior-art packet download</li>
                  <li>Research workspace</li>
                </ul>
                <Link to="/app/check" className="btn ghost">
                  Start checking ideas
                </Link>
              </div>
              <div className="plan featured">
                <h3>Program</h3>
                <div className="price">Per cohort</div>
                <p className="for">For accelerators and incubators</p>
                <ul>
                  <li>Everything in Founder</li>
                  <li>Opportunity scout across your sectors</li>
                  <li>Shared cohort workspace (planned)</li>
                  <li>Mentor review queue (planned)</li>
                </ul>
                <Link to="/app/scout" className="btn">
                  Try scout
                </Link>
              </div>
              <div className="plan">
                <h3>Institution</h3>
                <div className="price">Custom</div>
                <p className="for">For IP clinics and tech transfer offices</p>
                <ul>
                  <li>Corpora loaded for your CPC classes</li>
                  <li>Search quality measured on your own cases (planned)</li>
                  <li>Attorney handoff workflow (planned)</li>
                  <li>Single sign-on (planned)</li>
                </ul>
                <Link to="/app/research/corpus" className="btn ghost">
                  See the corpus profile
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="limits">
          <div className="wrap">
            <h2>What Second Life is not</h2>
            <p className="intro">
              A first layer of research makes the attorney's time go further. It doesn't replace it.
            </p>
            <div className="not-list">
              <div>
                <h3>Not a legal opinion</h3>
                <p>No report says whether you can get a patent, or whether a product infringes one. Only a registered practitioner can advise you on that.</p>
              </div>
              <div>
                <h3>Not a freedom-to-operate search</h3>
                <p>Overlap scores compare words, not the legal scope of claims. Claim construction needs a professional.</p>
              </div>
              <div>
                <h3>Not a complete search</h3>
                <p>Only the indexed corpus is searched: one US class today. Foreign patents, applications and products aren't included.</p>
              </div>
              <div>
                <h3>Where to get advice</h3>
                <p>
                  Find a registered practitioner on the <a href={USPTO_ROSTER} target="_blank" rel="noreferrer">USPTO roster</a>, or look at
                  the <a href={USPTO_PRO_BONO} target="_blank" rel="noreferrer">Patent Pro Bono Program</a> and{" "}
                  <a href={USPTO_CLINICS} target="_blank" rel="noreferrer">law school clinics</a>.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="wrap">
            <div>
              <h2>Bring your next idea to the first meeting with evidence.</h2>
              <p>Describe it in a sentence or two. The first report takes about a minute.</p>
            </div>
            <Link to="/app/check" className="btn">
              Check an idea
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
