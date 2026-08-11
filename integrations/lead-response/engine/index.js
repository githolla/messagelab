// Public surface of the engine. Import from here.
//
//   import { runTest } from "./engine/index.js";
//   const out = await runTest(
//     { labelA: "Warm & personal", labelB: "Fast & direct", copyA, copyB },
//     { apiKey: process.env.ANTHROPIC_API_KEY, context: "B2B software demo request" }
//   );
//   out.analysis.verdict; // "ship_a" | "ship_b" | "rework" | "tie"

export { runTest } from "./simulate.js";
export { reactToVariants } from "./react.js";
export { analyzePanel, ANALYSTS, tally } from "./analyze.js";
export { buildPanel, LEAD_ARCHETYPES } from "./panel.js";
export { callClaude, extractJson } from "./anthropic.js";
