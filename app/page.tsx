import { INDUSTRIES } from "@/lib/industries";
import { ANALYSTS, panelFor, monogram } from "@/lib/archetypes";

export default function Home() {
  const industryCount = INDUSTRIES.length;
  const sampleBots = panelFor("ecommerce"); // concrete example panel for the hero strip

  return (
    <>
      {/* Hero */}
      <section className="lp-hero">
        <div className="badge">Simulated audience testing · {industryCount} industries</div>
        <h1>
          Know how your message lands —{" "}
          <span>before you hit send.</span>
        </h1>
        <p>
          Message Lab tests your emails, letters, and landing pages against a panel of
          industry-specific customer bots, then hands you a decision: which version wins, who
          bounces, and where to focus.
        </p>
        <div className="herocta">
          <a className="btn primary" href="/test">
            Run an A/B message test →
          </a>
          <a className="btn ghost" href="/review">
            Review a live page
          </a>
        </div>
        <div className="herostats">
          <span><b>{industryCount}</b> industries</span>
          <span><b>~20</b> reactions / run</span>
          <span><b>5</b> analyst lenses</span>
          <span><b>~2 min</b> to a verdict</span>
        </div>
      </section>

      {/* Meet the panel */}
      <section className="lp-panel">
        <div className="lp-eyebrow">Meet your panel</div>
        <h2>Audience archetypes react — specialist analysts interpret.</h2>
        <div className="lp-botrow">
          {sampleBots.map((a) => (
            <span className="chip" key={a.name}>
              <span className="e">{monogram(a.name)}</span>
              {a.name}
            </span>
          ))}
          <span className="chip muted">+ {industryCount} industries&apos; panels</span>
        </div>
        <div className="lp-botrow">
          {ANALYSTS.map((a) => (
            <span className="chip analyst" key={a.key}>
              <span className="e">{monogram(a.label)}</span>
              {a.label}
            </span>
          ))}
        </div>
      </section>

      {/* Tools */}
      <section className="tools">
        <a className="toolcard" href="/test">
          <div className="ti">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12M9 3v6.5L4.5 17a2.5 2.5 0 0 0 2.2 3.7h10.6A2.5 2.5 0 0 0 19.5 17L15 9.5V3" />
              <path d="M7.5 14h9" />
            </svg>
          </div>
          <h2>A/B Message Test</h2>
          <p>
            Pick an industry, paste two versions (or auto-craft them), and run them past the
            audience bots. Get a verdict, per-segment drivers, and a prioritized fix list — then let
            Claude refine the weaker version until results plateau.
          </p>
          <span className="tlink">Open the test →</span>
        </a>
        <a className="toolcard" href="/leads">
          <div className="ti">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h11" />
              <circle cx="19" cy="18" r="2.4" />
            </svg>
          </div>
          <h2>Lead Personalization</h2>
          <p>
            Turn a webinar attendee list into a prioritized work queue. For each lead, a simulated
            cohort of similar prospects decides the follow-up most likely to work — insight,
            resource, conversation, meeting, or wait — then drafts the email to review and approve.
          </p>
          <span className="tlink">Open the workflow →</span>
        </a>
        <a className="toolcard" href="/rfp">
          <div className="ti">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13l2 2 4-4" />
            </svg>
          </div>
          <h2>RFP Simulator</h2>
          <p>
            Responding to an RFP? Paste the requirements and your draft proposal, and a simulated
            buying committee — economic buyer, technical evaluator, procurement, champion, security —
            scores your win likelihood, where you&apos;d lose points, and what to fix before you submit.
          </p>
          <span className="tlink">Open the simulator →</span>
        </a>
        <a className="toolcard" href="/review">
          <div className="ti">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M20 20l-4.7-4.7" />
            </svg>
          </div>
          <h2>UX Page Review</h2>
          <p>
            Paste any URL. The app screenshots it and Claude returns an expert UI/UX and usability
            review — hierarchy, clarity, navigation, the primary CTA, trust, and accessibility —
            scored, with severity-ranked fixes, tuned to your industry.
          </p>
          <span className="tlink">Open the review →</span>
        </a>
      </section>

      {/* Sample output */}
      <section className="lp-sample">
        <div className="lp-eyebrow">What you get</div>
        <h2>A recommendation, not a wall of charts.</h2>
        <div className="lp-preview card">
          <div className="vlabel">Recommendation</div>
          <div className="vhead">
            <span className="vbadge ship_b">Ship Version B</span>
            <div className="vheadline">
              &ldquo;1 in 7&rdquo; converts more of the panel (15 vs 11).
            </div>
          </div>
          <p className="vsummary">
            The data-led version wins on intent to act, especially with skeptical and
            first-time segments. The story-led version resonates emotionally but leaves the
            specifics too vague to move cautious readers.
          </p>
          <ul className="actionlist" style={{ marginTop: 14 }}>
            <li>
              <span className="pri high">high</span>Lead with the concrete number in the subject
              line — it drove the win.
            </li>
            <li>
              <span className="pri medium">medium</span>Add one proof point for the skeptical
              segment before the ask.
            </li>
            <li>
              <span className="pri low">low</span>Tighten the opening; several bots mentioned
              skimming.
            </li>
          </ul>
          <div className="lp-preview-tag">Illustrative — your run uses your copy and industry.</div>
        </div>
      </section>

      {/* Industries */}
      <section className="lp-inds">
        <div className="lp-eyebrow">Built for your vertical</div>
        <h2>{industryCount} industries, each with its own audience.</h2>
        <div className="lp-indchips">
          {INDUSTRIES.filter((i) => i.key !== "general").map((i) => (
            <span className="ichip" key={i.key}>
              {i.label}
            </span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="how">
        <h2 className="howh">How it works</h2>
        <ol className="steps">
          <li>
            <span className="sn">1</span>
            <div>
              <strong>Pick your industry.</strong> Message Lab loads the audience bots that fit —
              a bargain hunter and brand loyalist for retail, a rate watcher and first-time buyer
              for mortgage.
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
              <strong>Get a decision.</strong> A verdict up top, the reasons behind it, and the
              specific changes to make — the analyst bots do the interpreting.
            </div>
          </li>
        </ol>
      </section>

      <section className="lp-cta">
        <h2>Test your next message in about two minutes.</h2>
        <div className="herocta">
          <a className="btn primary" href="/test">
            Run an A/B message test →
          </a>
          <a className="btn ghost" href="/review">
            Review a live page
          </a>
        </div>
      </section>

      <p className="caveat homecaveat">
        Results are simulated audience responses — directional signal for testing, not a prediction
        of real-world performance. Validate high-stakes decisions with real people.
      </p>
    </>
  );
}
