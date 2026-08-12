# Lead Response — message-test engine

A drop-in copy of Message Lab's simulation engine, trimmed to **email only** and
reframed for **lead response** (sales reply A/B testing), then hardened with the
best ideas from the upstream **MatrAIx** research framework. Plain Node.js ESM,
no TypeScript, no framework. The core (`engine/`) has **zero npm dependencies** —
just Node 18+ for global `fetch`.

It answers one question: given two versions of a reply email, **which one earns
more replies from your leads, and what should change** — before a rep sends it.

## How it works

Three stateless Claude calls, wired together. No database of its own.

```
buildPanel()          →  ~20 lead personas (5 archetypes × 4 instances)   [pure data]
reactToVariants()     →  1 Claude call PER persona → strict-JSON reaction  [stage 2, fanned out]
analyzePanel()        →  1 Claude call over all reactions → the report      [stage 3]
```

`runTest()` does all three: builds the panel, fans reactions out through a
bounded worker pool (concurrency 4), runs a faithfulness check, then analyzes.
So one test = **N + 1** Claude calls (~21 for a 20-persona panel).

```
engine/
  anthropic.js       raw fetch + retry/backoff + hardened JSON (prefill + repair retry)
  panel.js           lead archetypes → personas          (stage 1)
  persona-render.js  grouped second-person identity prompt (MatrAIx-style)
  react.js           one persona reacts to A vs B         (stage 2)
  grounding.js       faithfulness / did-the-sim-hold check
  stats.js           Wilson confidence intervals
  analyze.js         reactions → decision report          (stage 3)
  demo.js            deterministic fallback (no API) so a failed run still renders
  simulate.js        runTest(): fan-out + grounding + analyze + fallbacks + manifest
  refine.js          refineLoop(): draft a challenger, re-test until plateau
  diff.js            word-level diff for showing refine changes
  index.js           public exports
example/
  express-route.js   Express + better-sqlite3 route you can lift
  run-cli.js         node example/run-cli.js — one test from the terminal
```

## Install

```bash
cp -r integrations/lead-response/engine  <your-app>/src/message-engine
# core needs nothing; the example route uses your existing express + better-sqlite3
```

Set the key server-side (never ship it to the browser):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export MESSAGE_LAB_MODEL=claude-sonnet-4-6   # optional override; this is the default
```

## Use it

```js
import { runTest } from "./message-engine/index.js";

const out = await runTest(
  { labelA: "Warm & consultative", labelB: "Fast & specific", copyA, copyB },
  { apiKey: process.env.ANTHROPIC_API_KEY, context: "Inbound pricing enquiry, B2B SaaS" }
);

out.analysis.verdict;       // "ship_a" | "ship_b" | "rework" | "tie"
out.analysis.headline;      // one-line takeaway
out.analysis.actions;       // [{ priority, action }]  — prioritized fixes
out.tally.replyRateB.ci;    // "60% · 95% CI 39–78%"   — honest small-n band
out.faithfulness;           // { faithfulnessRate, flagged, duplicateRationaleRate }
out.manifest;               // { model, panelSize, reacted, failed, segments, generatedAt }
out.results;                // every persona's raw reaction
out.errors;                 // per-persona failures (excluded from the report)
out.demo;                   // true if a fallback was used (see below)
```

Auto-refine (draft a stronger challenger for the losing version, re-test until
reply intent plateaus):

```js
import { refineLoop } from "./message-engine/index.js";
const { rounds, final } = await refineLoop(variants, { apiKey, maxRounds: 3 });
// rounds[r].draft.diff  → word-level diff of what changed that round
```

Smoke-test it:

```bash
ANTHROPIC_API_KEY=sk-ant-... node integrations/lead-response/example/run-cli.js
```

## What's new vs. a plain lift (borrowed from MatrAIx + Message Lab)

- **Realistic persona prompt** (`persona-render.js`) — personas render as a
  grouped, second-person identity ("You are …", headspace / how you read a
  message / what wins you), empties pruned, with an explicit "never break
  character / never mention you're a simulation" rule. Adapted from MatrAIx's
  persona rendering; far better than a flat `key: value` dump.
- **Faithfulness check** (`grounding.js`) — flags reactions where the sim broke
  down (meta/AI language, incoherent winner-vs-intent, degenerate or duplicated
  rationales) and returns a panel `faithfulnessRate`. If it's low, the analysis
  prompt is told to weight the verdict down. Adapted from MatrAIx's grounding.
- **Wilson confidence intervals** (`stats.js`) — reply rates report a 95% band
  so ~20 personas aren't read as precise. From Message Lab.
- **Graceful fallback** (`demo.js`) — if every reaction fails (e.g. the account
  is out of credits) or the analysis call fails, the engine returns a complete
  deterministic report marked `demo: true` instead of throwing. The feature
  never shows a blank/error screen.
- **JSON hardening** (`anthropic.js`) — assistant prefill forces a JSON object,
  and a one-shot repair retry recovers from chatty/truncated output.
- **Run manifest** — `out.manifest` records model, panel size, how many reacted
  vs failed, and the segments, for reproducibility/audit. Store it.
- **A/B order control** (kept from the source) — each persona sees A/B in a
  deterministic, hashed order so position bias doesn't decide the winner. (Note:
  MatrAIx's own Survey environment does *not* counterbalance option order — this
  engine is actually more rigorous than the upstream harness on that point.)

## Wiring into the Lead Response tool (Express + SQLite)

See `example/express-route.js` — it exposes:

- `POST /api/message-tests` `{ leadId?, labelA?, labelB?, copyA, copyB, context? }`
  → runs the test, stores it in a `message_tests` table, returns the full report.
- `GET  /api/message-tests/:id` → the stored run.

The engine is stateless; **persistence is yours**. Store the full result JSON
(including `manifest` and `faithfulness`) so you can render history and audit
runs from your own SQLite.

## Customizing

- **Audience** — edit `LEAD_ARCHETYPES` in `panel.js` (each archetype takes
  `name`, `how`, `mindset`, `hot`), or pass your own array to `buildPanel()`.
  Load per-campaign archetypes from SQLite and hand them in.
- **Analyst lenses** — edit `ANALYSTS` in `analyze.js`.
- **Intent vocabulary** — the reply tiers (`reply_low/clear/hot`) live in
  `react.js` (questionnaire + schema) and `analyze.js` (labels + which count as
  "would reply"). Keep the two in sync if you change them.
- **Panel size / cost** — `instances` in `buildPanel` sets personas per
  archetype; `concurrency` in `runTest` controls parallelism.

## Operational notes

1. **Key stays server-side.** All calls run in your Express process.
2. **Cost/latency scale with panel size** — N + 1 calls per test; refine adds a
   full N + 1 per round plus one draft call. The retry loop in `anthropic.js`
   handles rate limits (429/529/5xx).
3. **Model is swappable** via the `model` option or `MESSAGE_LAB_MODEL`.
4. **Directional, not predictive.** Simulated reactions are a fast signal for
   *choosing between versions*, not a forecast of real reply rates. The reply-
   rate CIs and the faithfulness rate are there to keep that honest — surface
   them in the UI.

## What was removed vs. Message Lab / MatrAIx

Direct-mail and website/vision asset types, the multi-industry archetype
catalog, and image handling — not needed for email-only lead response. From the
full MatrAIx research framework this deliberately skips the 1M calibrated
persona corpus, stratified/confounder-controlled sampling, task-owned
verification, population-level cross-tab aggregation, and trajectory telemetry —
that's the research-grade tier, overkill for an in-app "which reply is better"
signal. What was worth borrowing (persona rendering, grounding) is in.
