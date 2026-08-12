// Orchestrator — the piece that lives in the browser in Message Lab, moved
// server-side here. Fans out one reaction call per persona through a bounded
// worker pool (default concurrency 4), runs the faithfulness/grounding pass,
// then analyzes. Degrades gracefully:
//   - some reactions fail  -> report on the rest, surface the failure count
//   - ALL reactions fail   -> deterministic demo report (demo:true)
//   - analysis call fails  -> deterministic demo analysis (demo:true)
// Every result carries a run manifest for reproducibility/audit.

import { reactToVariants } from "./react.js";
import { analyzePanel } from "./analyze.js";
import { buildPanel } from "./panel.js";
import { groundPanel } from "./grounding.js";
import { demoResults, demoAnalysis } from "./demo.js";

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return null; // some sandboxed runtimes block Date; manifest just omits the timestamp
  }
}

/**
 * Run a full A/B test: build panel (or use the one passed), fan out reactions,
 * check faithfulness, analyze. Never throws on partial failure; only the demo
 * fallback path is taken when nothing usable comes back.
 *
 * @param {object} variants - { labelA, labelB, copyA, copyB }
 * @param {object} opts
 * @param {string} opts.apiKey        - ANTHROPIC_API_KEY (required)
 * @param {string} [opts.model]       - defaults to claude-sonnet-4-6
 * @param {Array}  [opts.panel]       - personas from buildPanel(); defaults to buildPanel()
 * @param {number} [opts.concurrency] - parallel reaction calls, default 4
 * @param {string} [opts.context]     - extra context for the analyst prompt
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 * @returns {Promise<{analysis, model, tally, results, errors, faithfulness, manifest, demo}>}
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
  const queue = panel.map((p, i) => ({ p, i }));
  let done = 0;

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      try {
        results.push(await reactToVariants(item.p, variants, { apiKey, model }));
      } catch (e) {
        errors.push({ personaId: item.p.id, error: String((e && e.message) || e) });
      }
      done++;
      if (onProgress) onProgress(done, panel.length);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const manifest = {
    model,
    panelSize: panel.length,
    reacted: results.length,
    failed: errors.length,
    segments: [...new Set(panel.map((p) => p.segment))],
    generatedAt: nowIso(),
  };

  // Total failure -> deterministic demo so the UI still renders something real.
  if (!results.length) {
    const demo = demoResults(panel, variants);
    const faithfulness = groundPanel(demo);
    return {
      analysis: demoAnalysis(variants, demo),
      model,
      tally: (await import("./analyze.js")).tally(demo),
      results: demo,
      errors,
      faithfulness,
      manifest: { ...manifest, reacted: 0 },
      demo: true,
      demoReason: errors[0] ? errors[0].error : "all reactions failed",
    };
  }

  const faithfulness = groundPanel(results);

  // Live analysis, with a deterministic fallback if the analysis call fails.
  let analysis;
  let tally;
  let demo = false;
  try {
    const out = await analyzePanel(variants, results, { apiKey, model, context, faithfulness });
    analysis = out.analysis;
    tally = out.tally;
  } catch (e) {
    analysis = demoAnalysis(variants, results);
    tally = (await import("./analyze.js")).tally(results);
    demo = true;
    manifest.analysisError = String((e && e.message) || e);
  }

  return { analysis, model, tally, results, errors, faithfulness, manifest, demo };
}
