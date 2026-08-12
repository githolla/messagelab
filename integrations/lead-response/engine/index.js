// Public surface of the engine. Import from here.
//
//   import { runTest } from "./engine/index.js";
//   const out = await runTest(
//     { labelA: "Warm & personal", labelB: "Fast & direct", copyA, copyB },
//     { apiKey: process.env.ANTHROPIC_API_KEY, context: "B2B software demo request" }
//   );
//   out.analysis.verdict;   // "ship_a" | "ship_b" | "rework" | "tie"
//   out.tally.replyRateB.ci;// "60% · 95% CI 39–78%"
//   out.faithfulness;       // { faithfulnessRate, flagged, ... }
//   out.demo;               // true if a fallback (no-credits / analysis-fail) was used
//
//   import { refineLoop } from "./engine/index.js";  // draft-and-retest until plateau

export { runTest } from "./simulate.js";
export { reactToVariants } from "./react.js";
export { analyzePanel, ANALYSTS, tally } from "./analyze.js";
export { buildPanel, LEAD_ARCHETYPES } from "./panel.js";
export { renderPersona } from "./persona-render.js";
export { groundPanel, checkReaction } from "./grounding.js";
export { wilson, shareWithCI } from "./stats.js";
export { demoResults, demoAnalysis } from "./demo.js";
export { refineLoop } from "./refine.js";
export { wordDiff } from "./diff.js";
export { callClaude, callClaudeJson, extractJson } from "./anthropic.js";
