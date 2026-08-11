// Smoke test / demo — run one A/B test from the command line.
//   ANTHROPIC_API_KEY=sk-... node example/run-cli.js
//
// Prints the verdict, headline, and per-segment reply counts. Good for
// confirming the engine works before wiring it into the app.

import { runTest } from "../engine/index.js";

const copyA = `Hi {{firstName}},

Thanks for reaching out about pricing. I pulled a couple of options that fit what you described — happy to walk you through them on a quick 15-minute call. What does Thursday look like?

Best,
Sam`;

const copyB = `Hi {{firstName}},

Got your request — here's the short version: plans start at $49/mo, setup is same-day, and you can cancel anytime. Want me to send the full breakdown, or grab time here: {{link}}?

Sam`;

const out = await runTest(
  { labelA: "Warm & consultative", labelB: "Fast & specific", copyA, copyB },
  {
    apiKey: process.env.ANTHROPIC_API_KEY,
    context: "Inbound pricing enquiry for a B2B SaaS product.",
    onProgress: (done, total) => process.stdout.write(`\rReactions: ${done}/${total}`),
  }
);

console.log("\n");
console.log("Verdict :", out.analysis.verdict);
console.log("Headline:", out.analysis.headline);
console.log("Votes   :", `A ${out.tally.votesA} / B ${out.tally.votesB}  (would reply: A ${out.tally.repliesA} / B ${out.tally.repliesB})`);
console.log("\nTop actions:");
for (const a of out.analysis.actions.slice(0, 3)) console.log(`  [${a.priority}] ${a.action}`);
if (out.errors.length) console.log(`\n(${out.errors.length} reaction(s) failed and were excluded.)`);
