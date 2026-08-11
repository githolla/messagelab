# Lead Response — message-test engine

A drop-in copy of Message Lab's simulation engine, trimmed to **email only** and
reframed for **lead response** (sales reply A/B testing). Plain Node.js ESM, no
TypeScript, no framework. The core (`engine/`) has **zero npm dependencies** —
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
bounded worker pool (concurrency 4), then analyzes. So one test = **N + 1**
Claude calls (~21 for a 20-persona panel).

```
engine/
  anthropic.js   raw fetch + retry/backoff — the ONLY file that hits the network
  panel.js       lead archetypes → personas          (stage 1)
  react.js       one persona reacts to A vs B         (stage 2)
  analyze.js     reactions → decision report          (stage 3)
  simulate.js    runTest(): fan-out + analyze          (orchestrator)
  index.js       public exports
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
# optional model override; defaults to claude-sonnet-4-6
export MESSAGE_LAB_MODEL=claude-sonnet-4-6
```

## Use it

```js
import { runTest } from "./message-engine/index.js";

const out = await runTest(
  { labelA: "Warm & consultative", labelB: "Fast & specific", copyA, copyB },
  { apiKey: process.env.ANTHROPIC_API_KEY, context: "Inbound pricing enquiry, B2B SaaS" }
);

out.analysis.verdict;   // "ship_a" | "ship_b" | "rework" | "tie"
out.analysis.headline;  // one-line takeaway
out.analysis.actions;   // [{ priority, action }]  — prioritized fixes
out.tally;              // { votesA, votesB, repliesA, repliesB, ... }  — deterministic counts
out.results;            // every persona's raw reaction (store or display)
out.errors;             // per-persona failures (excluded from the report)
```

Smoke-test it first:

```bash
ANTHROPIC_API_KEY=sk-ant-... node integrations/lead-response/example/run-cli.js
```

## Wiring into the Lead Response tool (Express + SQLite)

See `example/express-route.js` — it exposes:

- `POST /api/message-tests` `{ leadId?, labelA?, labelB?, copyA, copyB, context? }`
  → runs the test, stores it in a `message_tests` table, returns the full report.
- `GET  /api/message-tests/:id` → the stored run.

The engine is stateless; **persistence is yours**. The example writes the full
result JSON into one column so you can render history / shareable result pages
from your own SQLite.

## Customizing

- **Audience** — edit `LEAD_ARCHETYPES` in `panel.js`, or pass your own array to
  `buildPanel(archetypes, instances)`. You can load archetypes per campaign from
  SQLite and hand them in.
- **Analyst lenses** — edit `ANALYSTS` in `analyze.js`.
- **Intent vocabulary** — the reply tiers (`reply_low/clear/hot`) live in
  `react.js` (the questionnaire + schema) and `analyze.js` (labels + which count
  as "would reply"). Keep those two in sync if you change them.
- **Panel size / cost** — `instances` in `buildPanel` sets personas per
  archetype; `concurrency` in `runTest` controls parallelism. Bigger panel =
  more signal but more calls and latency.

## Operational notes

1. **Key stays server-side.** All calls run in your Express process, never the
   Vite client.
2. **Cost/latency scale with panel size** — N + 1 calls per test. The retry loop
   in `anthropic.js` handles rate limits (429/529/5xx) with backoff.
3. **Model is swappable** via `model` option or `MESSAGE_LAB_MODEL`.
4. **Directional, not predictive.** These are simulated reactions — a fast
   signal for *choosing between versions*, not a forecast of real reply rates.
   Surface that caveat in the UI, same as Message Lab does.

## What was removed vs. Message Lab

Direct-mail and website/vision asset types, the multi-industry archetype
catalog, image downscaling, and the Next.js route wrappers — none of it is
needed for email-only lead response. The auto-refine loop
(`refine` in the source app) was left out; ask if you want it ported too.
