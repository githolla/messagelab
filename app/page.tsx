import { INDUSTRIES } from "@/lib/industries";
import { FOCUS_KINDS } from "@/lib/focus";
import RoomDemo from "@/components/RoomDemo";

export default function Home() {
  const industryCount = INDUSTRIES.filter((i) => i.key !== "general").length;

  return (
    <>
      {/* Hero */}
      <section className="lp-hero">
        <div className="badge">Simulated focus groups · powered by persona-agents</div>
        <h1>
          Put it in front of the room —{" "}
          <span>before it&apos;s real.</span>
        </h1>
        <p>
          Message Lab convenes a simulated focus group of intelligent persona-agents that react
          in character to whatever you&apos;re working on — a product, a landing page, a strategy, a
          concept. Each one has its own point of view, so you get a real spread of opinion, not an
          average. You leave with a structured report: the verdict, the reasons, and what to fix.
        </p>
        <div className="herocta">
          <a className="btn primary" href="/test">
            Open the Focus Group →
          </a>
          <a className="btn ghost" href="#how">
            See how it works
          </a>
        </div>
        <div className="herostats">
          <span><b>{industryCount}</b> industries</span>
          <span><b>7</b> things you can test</span>
          <span><b>1000s</b> of persona-agents</span>
          <span><b>~2 min</b> to a report</span>
        </div>
      </section>

      {/* Meet the panel — a live demo of the room */}
      <section className="lp-panel">
        <div className="lp-eyebrow">Meet the room</div>
        <h2>A panel of persona-agents — each reacts as itself.</h2>
        <p className="lp-lede">
          Pick an industry and the panel fills with audience archetypes that fit it. Dial the size,
          rename or add segments, then send them your subject. Every agent answers individually — the
          same persona-agent engine, grounded in the MatrAIx research, that the whole app runs on.
        </p>
        <RoomDemo />
      </section>

      {/* What you can test */}
      <section className="lp-uses">
        <div className="lp-eyebrow">One tool, many questions</div>
        <h2>Test anything the room can have an opinion on.</h2>
        <div className="usegrid">
          {FOCUS_KINDS.map((k) => (
            <a className="usecard" href="/test" key={k.key}>
              <div className="use-t">{k.label}</div>
              <div className="use-b">{k.blurb}</div>
            </a>
          ))}
        </div>
      </section>

      {/* Spotlight: live website walkthrough */}
      <section className="lp-spot">
        <div className="spot-copy">
          <div className="lp-eyebrow accent">The standout</div>
          <h2>For a live site, the panel walks it themselves.</h2>
          <p>
            Paste a URL and each persona-agent drives its own browser through your site — clicking,
            scrolling, following links, in character — until it converts or gives up. You see the exact
            path each one took, where they dropped off, and their honest reaction to the real experience.
          </p>
          <a className="btn primary" href="/test">
            Send a panel through your site →
          </a>
        </div>
        <div className="spot-demo">
          <div className="spot-hop"><span>Home</span><i>→</i><span>Pricing</span><i>→</i><span>Sign up</span><em>converts</em></div>
          <div className="spot-hop bad"><span>Home</span><i>→</i><span>Features</span><i>→</i><span>FAQ</span><em>drops off</em></div>
          <div className="spot-hop"><span>Home</span><i>→</i><span>About</span><i>→</i><span>Contact</span><em>on the fence</em></div>
        </div>
      </section>

      {/* How it works */}
      <section className="how" id="how">
        <h2 className="howh">How it works</h2>
        <ol className="steps">
          <li>
            <span className="sn">1</span>
            <div>
              <strong>Pick what you&apos;re testing and who&apos;s in the room.</strong> Choose the
              subject — product, site, strategy, concept — an industry, and a panel size. The audience
              auto-fills as editable segments.
            </div>
          </li>
          <li>
            <span className="sn">2</span>
            <div>
              <strong>The panel reacts — or walks your site.</strong> Each persona-agent responds in
              character with sentiment, likelihood to act, what resonates, and concerns. For a live
              site, they browse it themselves.
            </div>
          </li>
          <li>
            <span className="sn">3</span>
            <div>
              <strong>Read the report.</strong> A verdict up top, the reasons behind it, the themes the
              room raised, a breakdown by segment, and every individual reaction — on its own page,
              ready to print or share.
            </div>
          </li>
        </ol>
      </section>

      {/* Sample output */}
      <section className="lp-sample">
        <div className="lp-eyebrow">What you get</div>
        <h2>A decision, not a wall of charts.</h2>
        <div className="lp-preview card">
          <div className="vlabel">Focus group verdict</div>
          <div className="vhead">
            <span className="vbadge ship_b">Promising</span>
            <div className="vheadline">
              62% positive — but two concerns are holding the room back.
            </div>
          </div>
          <p className="vsummary">
            The value lands quickly and the skeptics warm up once they see proof. The pricing page and a
            vague call-to-action are where cautious segments hesitate — fix those and the greenlight is
            within reach.
          </p>
          <ul className="actionlist" style={{ marginTop: 14 }}>
            <li><span className="pri high">high</span>Lead with the concrete proof point — it moved the skeptics.</li>
            <li><span className="pri medium">medium</span>Clarify the primary CTA; several agents got stuck deciding.</li>
            <li><span className="pri low">low</span>Tighten the opening; a few said they nearly bounced.</li>
          </ul>
          <div className="lp-preview-tag">Illustrative — your run uses your subject and audience.</div>
        </div>
      </section>

      {/* Industries */}
      <section className="lp-inds">
        <div className="lp-eyebrow">Built for your vertical</div>
        <h2>{industryCount} industries, each with its own audience.</h2>
        <div className="lp-indchips">
          {INDUSTRIES.filter((i) => i.key !== "general").map((i) => (
            <span className="ichip" key={i.key}>{i.label}</span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta">
        <h2>Convene your focus group in about two minutes.</h2>
        <div className="herocta">
          <a className="btn primary" href="/test">
            Open the Focus Group →
          </a>
        </div>
      </section>

      <p className="caveat homecaveat">
        Reactions are simulated persona-agent responses — model-dependent and hypothesis-generating.
        Use them to sharpen the work and surface objections early, not to predict the market. Validate
        high-stakes decisions with real people.
      </p>
    </>
  );
}
