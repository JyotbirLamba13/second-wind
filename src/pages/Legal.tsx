import { SiteFooter, SiteNav } from "../components/SiteChrome";
import { USPTO_CLINICS, USPTO_PRO_BONO, USPTO_ROSTER } from "../components/ui";

export function Legal() {
  return (
    <div className="site">
      <SiteNav />
      <main className="doc">
        <h1>First-pass research, not legal advice</h1>
        <p>
          Second Life is a research tool. It helps you find patents that look similar to an idea and organizes them so you can have a
          better-informed conversation with a patent professional. It is not a law firm, does not employ attorneys to review your results, and
          does not create an attorney-client relationship.
        </p>

        <h2>What a report can tell you</h2>
        <ul>
          <li>Which patents in the indexed corpus share the most distinctive terms with your description.</li>
          <li>Whether those patents appear to be in force, expired or lapsed, based on their filing date and the 20-year term.</li>
          <li>Which claim terms overlap and which don't, as a starting point for a claim chart.</li>
        </ul>

        <h2>What a report cannot tell you</h2>
        <ul>
          <li>Whether your idea is patentable. Novelty and non-obviousness are legal judgments over all prior art, worldwide.</li>
          <li>Whether a product infringes a patent, or whether you have freedom to operate. That depends on how claims are construed.</li>
          <li>The exact legal status of a patent. Maintenance-fee, reissue, litigation and reexamination records aren't checked.</li>
          <li>Anything about patents, applications or products outside the indexed corpus.</li>
        </ul>

        <h2>How to read the colors</h2>
        <p>
          Green, yellow and red describe word overlap with the patents we index, measured against fixed thresholds. Green doesn't mean safe and
          red doesn't mean blocked. A red result means a professional should look at the cited claims before you invest further.
        </p>

        <h2>How the AI is kept in check</h2>
        <p>
          An AI model helps read ideas, word explanations and answer follow-up questions. It never decides a result on its own, and everything it
          writes is checked automatically before you see it:
        </p>
        <ul>
          <li>It can only make a result more cautious. Your exact words are always searched too, and the higher overlap counts.</li>
          <li>Answers may only name patents in your report, and only use percentages and dates the report contains.</li>
          <li>Text that sounds like a legal conclusion, such as "you won't infringe" or "this is patentable", is blocked.</li>
          <li>Restatements of your idea, and changes you describe, must stay close to your own words.</li>
          <li>When AI text fails a check, you get an answer built directly from the report instead, and it's labeled that way.</li>
          <li>Questions about infringement, licensing or legal risk always end with a pointer to a registered patent attorney.</li>
        </ul>

        <h2>Demo data</h2>
        <p>
          The live corpus covers one US patent class: coffee and beverage-making apparatus (CPC A47J31). For other ideas, the demo invents
          fictional patents so you can see the workflow. Those reports carry a banner, every mock patent is labeled, and none of it describes
          real patents. Don't rely on mock results for anything.
        </p>

        <h2>Getting professional help</h2>
        <p>
          Only registered patent attorneys and agents can represent you before the USPTO. You can look one up on the{" "}
          <a href={USPTO_ROSTER} target="_blank" rel="noreferrer">USPTO practitioner roster</a>. If cost is a barrier, the{" "}
          <a href={USPTO_PRO_BONO} target="_blank" rel="noreferrer">Patent Pro Bono Program</a> and{" "}
          <a href={USPTO_CLINICS} target="_blank" rel="noreferrer">law school clinic program</a> connect eligible inventors with free help.
          Bring your prior-art packet to that meeting.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
