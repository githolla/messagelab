import { INDUSTRIES } from "@/lib/industries";

export default function Home() {
  const industryCount = INDUSTRIES.length;
  return (
    <>
      <section className="hero">
        <div className="badge">Simulated audience testing</div>
        <h1>
          Test your message before you send it — against a panel of{" "}
          <span>simulated customers</span>.
        </h1>
        <p>
          Message Lab reacts your emails, landing pages, and campaigns to industry-specific audience
          bots, then hands you a decision-ready read: who converts, who bounces, and exactly what to
          change. For any of {industryCount} industries.
        </p>
        <div className="herocta">
          <a className="btn primary" href="/test">
            Run an A/B message test →
          </a>
          <a className="btn ghost" href="/review">
            Review a live page
          </a>
        </div>
      </section>

      <section className="tools">
        <a className="toolcard" href="/test">
          <div className="ti">🧪</div>
          <h2>A/B Message Test</h2>
          <p>
            Pick an industry, paste two versions (or auto-craft them), and run them past a panel of
            audience archetypes. Get a verdict, per-segment drivers, and a prioritized fix list —
            then let Claude refine the weaker version until results plateau.
          </p>
          <span className="tlink">Open the test →</span>
        </a>
        <a className="toolcard" href="/review">
          <div className="ti">🔍</div>
          <h2>UX Page Review</h2>
          <p>
            Paste any URL. The app screenshots it and Claude returns an expert UI/UX and usability
            review — visual hierarchy, clarity, navigation, the primary CTA, trust, and
            accessibility — scored, with severity-ranked fixes, tuned to your industry.
          </p>
          <span className="tlink">Open the review →</span>
        </a>
      </section>

      <section className="how">
        <h2 className="howh">How it works</h2>
        <ol className="steps">
          <li>
            <span className="sn">1</span>
            <div>
              <strong>Pick your industry.</strong> Message Lab loads the audience bots that fit —
              a bargain hunter and brand loyalist for retail, a rate watcher and first-time buyer
              for mortgage, and so on.
            </div>
          </li>
          <li>
            <span className="sn">2</span>
            <div>
              <strong>Bring your message.</strong> Paste two versions to A/B, auto-craft them from a
              message type, or drop in a live URL to review.
            </div>
          </li>
          <li>
            <span className="sn">3</span>
            <div>
              <strong>Get a decision, not a data dump.</strong> A verdict up top, the reasons behind
              it, and the specific changes to make — the analyst bots do the interpreting for you.
            </div>
          </li>
        </ol>
      </section>

      <p className="caveat homecaveat">
        Results are simulated audience responses — directional signal for testing, not a prediction
        of real-world performance. Validate high-stakes decisions with real people.
      </p>
    </>
  );
}
