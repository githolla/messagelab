// Orchestrator — the piece that lives in the browser in Message Lab, moved
// server-side here. Fans out one reaction call per persona through a bounded
// worker pool (default concurrency 4, which keeps you under rate limits), then
// runs the analysis. This is the single function most callers use.

import { reactToVariants } from "./react.js";
import { analyzePanel } from "./analyze.js";
import { buildPanel } from "./panel.js";

/**
 * Run a full A/B test: build panel (or use the one passed), fan out reactions,
 * analyze. Returns the report plus the raw reactions and any per-persona errors.
 *
 * @param {object} variants - { labelA, labelB, copyA, copyB }
 * @param {object} opts
 * @param {string} opts.apiKey        - ANTHROPIC_API_KEY (required)
 * @param {string} [opts.model]       - defaults to claude-sonnet-4-6
 * @param {Array}  [opts.panel]       - personas from buildPanel(); defaults to buildPanel()
 * @param {number} [opts.concurrency] - parallel reaction calls, default 4
 * @param {string} [opts.context]     - extra context for the analyst prompt (e.g. product, offer)
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 * @returns {Promise<{analysis, model, tally, results, errors, panelSize}>}
 */
export async function runTest(variants, opts) {
  const {
    apiKey,
    model = "claude-sonnet-4-6",
    panel = buildPanel(),
    concurrency = 4,
    context = "",
    onProgress,
  } = opts || {};

  if (!apiKey) throw new Error("apiKey is required.");
  if (!variants || !variants.copyA || !variants.copyB) {
    throw new Error("variants.copyA and variants.copyB are required.");
  }

  const results = [];
  const errors = [];
  const queue = [...panel];
  let done = 0;

  async function worker() {
    while (queue.length) {
      const persona = queue.shift();
      if (!persona) break;
      try {
        results.push(await reactToVariants(persona, variants, { apiKey, model }));
      } catch (e) {
        errors.push({ personaId: persona.id, error: String((e && e.message) || e) });
      }
      done++;
      if (onProgress) onProgress(done, panel.length);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (!results.length) {
    const first = errors[0] ? errors[0].error : "unknown error";
    throw new Error(`All ${panel.length} reactions failed. First error: ${first}`);
  }

  const report = await analyzePanel(variants, results, { apiKey, model, context });
  return { ...report, results, errors, panelSize: panel.length };
}
