# HANDOFF — building the evaluator system into the Proposal Generator

Everything the proposal generator needs to run the Deterministic Gate and show
users the full evaluator roster. All of it is plain TypeScript with **zero
runtime dependencies, zero model calls, and no API key** — it runs client-side
or server-side identically.

## 1 · Files to copy, verbatim

| File | What it is | Lines |
| --- | --- | --- |
| `lib/gate/model.ts` | Types, the 30-check registry, verdicts, tally/sort | ~160 |
| `lib/gate/parse.ts` | Marked-text loader: sections, sentences, paragraphs, pipe/tab tables | ~140 |
| `lib/gate/checks.ts` | D49–D67 structural critics (D68 stubs — needs the PDF artifact) | ~460 |
| `lib/gate/evidence.ts` | F81–F90 evidence verifiers against the context registry | ~290 |
| `lib/gate/run.ts` | `runGate` / `diffGate` orchestrators | ~75 |
| `lib/gate/roster.json` | The full 100-evaluator roster (source of truth, v1.0.0) | data |
| `lib/gate/roster.ts` | Typed accessor: families, judge pool, labels, lookups | ~150 |
| `components/RosterBrowser.tsx` | The "every persona spelled out" browser UI (React) | ~140 |
| `components/GateTool.tsx` | Reference scorecard + diff UI (React) | ~230 |
| `lib/gate/sample.ts` | Defect-seeded demo docs + context (optional, for demos/tests) | ~150 |
| `lib/gate/room.ts` | The live Committee Room: per-persona visibility scopes, veto roles, demo reads, room aggregation | ~250 |
| `components/CommitteeRoom.tsx` | Convene-the-committee UI: lens + buyer-state pickers, live fan-out, stance chart, per-persona cards | ~250 |
| `app/api/gate-room/route.ts` | One committee persona reads their slice in character (needs an Anthropic client — swap in your own model call) | ~110 |

The only imports are between these files. `roster.json` needs
`"resolveJsonModule": true` in tsconfig. The two React components import only
React and the lib files; restyle or rewrite them freely — the engine doesn't
know the UI exists.

## 2 · The API surface

```ts
import { runGate, diffGate } from "lib/gate/run";

const run = runGate(proposalText, rfpText, context, new Date().getFullYear());
// run.findings: GateFinding[]  — sorted deficiencies → weaknesses → pass → skipped
// run.tally:    { deficiencies, weaknesses, passes, skipped, blocking }

const rows = diffGate(runA, runB); // side-by-side, one row per check
```

**Gate semantics: `run.tally.blocking > 0` means the draft does not ship.**
Wire that to whatever "attach / send / export" action the generator has — a
proposal with an unresolved placeholder cannot leave the building. Run it on
every save; it's effectively free.

`GateFinding`: `{ id, name, verdict, blocking, count, summary, examples: [{ section, quote }] }`.
Every finding carries its examples so a writer can act without going hunting.

## 3 · The context registry (`GateContext`)

Optional, all fields independent. A check that needs a piece and doesn't get
it reports `skipped` with the missing key named — **never a silent pass**.

```ts
{
  client:            { name, subsector, budgetBand, fileSize, region, orgType, toolset[], channels[] },
  people:            [{ name, title }],          // D65 — title must appear within 260 chars of the name
  referencesOffered: ["Org name"],               // F86 — also reads the doc's own References section
  citedCaseStudies:  [{ name, ...7 dims }],      // F85 proof-match, D51 proof anchors
  sources:           [{ name, year, maxAgeYears }],       // F81 provenance, F82 currency
  publishedAggregates: [{ label, value, tolerancePct }],  // F83 model reconciliation
  modelInputs:       [{ name, source, consequence }],     // F84 — both fields required
  staleTerms:        ["PriorClientName"],        // D57 prior-client residue
  rfpPreferences:    ["..."],   // F86 — else mined from the RFP (prefer/similar/experience-with)
  requiredColumns:   ["..."],   // D50 — else mined from the RFP ("columns: A, B, C")
  clientFacts:       [{ label, value }],         // F88 public-record cross-check
  agencyNames:       ["We", "Our", "AGP"],       // D51/D55 subject detection
  clientNames:       ["the College", "You", "Your"],
}
```

In the proposal generator this registry should be **populated by the pipeline,
not typed by hand**: the client profile from intake, people from the RFP
contact block, case studies and sources from the content library, model inputs
from the pricing model. That's when D65/F81–F88 light up for every run.

## 4 · Input format

Plain text (paste or your editor's export). The parser recognizes markdown
`#` headings, numbered headings (`3. Creative approach`), ALL-CAPS lines, and
short Title Case lines between blanks as section breaks; tables as pipe- or
tab-separated line runs (first row = header, a `Total` row is what D63
reconciles — rate-bearing columns, `%`/`rate`/`per`/`ROI`, are never summed).
If the generator has structured sections already, even better: concatenate as
`# Section Title\n\nbody` and fidelity is perfect.

## 5 · Precision rules already baked in (don't re-learn these)

- Years (1900–2100) are not quantities. Ranges are not contradictions; a real
  contradiction must appear in **two different sections**.
- A capability claim needs a first-person subject within the first 4 tokens
  AND a deliverable noun — otherwise prose gets flagged as features.
- RFP requirements hide in bullet runs after "must include:" — the extractor
  carries lead-in state. Submission mechanics ("submit by Sept 15") are
  excluded from coverage scoring: prose can't satisfy logistics.
- A title "anywhere in the document" is useless; within 260 chars of the name
  is the actual question.
- A critic that cries wolf gets switched off. When tuning thresholds, protect
  precision before recall.

## 6 · The roster — showing every persona to the user

`lib/gate/roster.json` + `roster.ts` give you all 100 evaluators typed and
display-ready: id, family (A–G with framing notes), name, brief, **emits**
(what the user sees it produce), role, kind, blocking, cost tier (0–3),
selection rule, and executed-by. `RosterBrowser.tsx` renders them as
family-grouped cards with search + filters — lift it as-is or restyle.

Things the roster's own notes insist the UI must not misrepresent:

- **It is not a voting panel.** A–C enumerate criteria and visibility scopes;
  D–F are checks; G runs on the assembled document. Scoring is done by a
  **3–5 model judge pool** from disjoint families (never two from one
  provider), 3 runs per criterion, median-aggregated, blinded to authorship /
  other judges / expected score / win themes, excluding any judge sharing
  lineage with the drafting model.
- **Family B lenses: pick exactly one.** Family C buyer-states run on a
  predicate — one selects the rhetorical strategy for the whole document.
- **Cost tiers gate frequency**: tier 0 on every save, tier 1 every draft,
  tier 2 candidate drafts, tier 3 release candidates only.

`gateStatus(id)` in `roster.ts` marks which roster entries are live in this
engine ("running in the Gate") — reimplement or drop it if the generator wires
its own subset.

## 7 · What is deliberately NOT in this package

The judge side: model pools, the criterion generator, metrics
(n_eff, kappa, theta_ratio), calibration (Rogan–Gladen, PPI). The contracts
for those live in the roster JSON (`judge_pool`, `criterion_schema`,
`finding_schema`) so the generator can build toward them, but per the
evidence, wire **one judge end to end and read its output by hand before
adding a second** — and start the frozen human-labelled anchor set the same
week. The deterministic half is the reliable half; ship it first.

## 8 · Integration checklist

1. Copy the files in §1; `npm run tsc` — no deps to install.
2. Feed `runGate` on every save; render `findings` grouped by verdict.
3. Block the export/send action on `tally.blocking > 0`, with the findings
   shown next to the disabled button (the reason, not just the refusal).
4. Populate `GateContext` from the generator's own data, not hand-typed JSON.
5. Mount `RosterBrowser` wherever users ask "who is evaluating this?"
6. Keep D68 visible as *skipped* until you run it on the rendered PDF —
   a skipped check the user can see is honest; a hidden one is a hole.
