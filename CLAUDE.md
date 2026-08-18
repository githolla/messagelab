# Message Lab — project context

Donor appeal pre-testing app for AGP (Allegiance Group + Pursuant), built by Barry
Medley with Nine-67. Test two variants of a donor-facing asset — email, direct mail
letter, or website UI (screenshots) — against a simulated donor persona panel, view
a segment-level results dashboard. "Message Lab" is a working title.

## Architecture

- Next.js 15 App Router, TypeScript, no CSS framework (hand-rolled `app/globals.css`).
- **The app is Focus-Group-only.** Routes: `/` is a Focus-Group-focused landing
  page; `/test` is the **Focus Group** (default) with the A/B message test as a
  toggle; `/test/report` is the results report page. `components/Nav.tsx` is a
  single "Focus Group" CTA in the header. The former Lead Personalization
  (`/leads`), RFP Simulator (`/rfp`), and UX Page Review (`/review`) tools —
  and their API routes — were removed from the product (the user carved off the
  RFP and webinar bundles into separate projects earlier). Their `lib/*` files
  (`rfp.ts`, `rfpsim.ts`, `leads.ts`, `leadsim.ts`, `leademail.ts`, `reviewers.ts`,
  `emailreview.ts`, `emailrewrite.ts`, `cohort.ts`) remain in the tree, unreferenced,
  as reference/roadmap — safe to delete if truly done with them.
- Focus Group (`lib/focus.ts`, `app/api/focus/route.ts`, `components/FocusGroup.tsx`;
  `app/test/page.tsx` toggles Focus Group ↔ the A/B `AbTest`): a persona-agent
  panel reviews ONE subject and returns structured feedback. Seven kinds
  (`FOCUS_KINDS`): new product/feature, website/landing page, GTM strategy, sales
  strategy, social strategy, concept/positioning, brand/creative — image-accepting
  kinds take prototype/screenshot uploads (reuses the vision path). Same core as
  the A/B tool: it reuses the industry archetypes via `autoSegments`/`scaleSegments`,
  builds individual persona-agents, and fans out one in-character reaction per
  agent (`/api/focus`, concurrency 4, per-persona demo fallback). Each reaction:
  sentiment (love→reject), likelihood 1–5, resonates/concern/question/suggestion,
  quote. `focusDemo` is deterministic (fnv1a); `summarizeFocus` aggregates into a
  verdict, sentiment/likelihood distributions, theme clusters, and per-segment
  breakdown. Results: verdict hero + stat tiles, sentiment stacked bar +
  likelihood chart, theme columns, by-segment bars, and the filterable room.
  Stays true to the persona-agent core (individual agents, not an average).
  When a run finishes, `FocusGroup` stashes the run (`reactions`, kind, industry,
  url, isDemo) in `sessionStorage` under `fg-report` and routes to a dedicated
  report page `app/test/report/page.tsx`, which reads it and renders
  `components/FocusReport.tsx` — a structured report: cover (verdict badge +
  headline + meta + stat tiles + jump-nav + Print/PDF), then collapsible
  `<details>` sections (Sentiment & likelihood, The walkthrough, What the room
  said, By segment, The room). Themes drill down to the persona-agents who
  raised them; segments drill down to their reactions (stacked sentiment bar);
  a print stylesheet expands everything and hides the chrome. Sentiment uses a
  diverging scale with a gray neutral midpoint (`#767c85`).
  Builder: Step 1 picks the kind + industry + an optional **format** chip
  (email / direct mail / social post / landing page / ad / deck / one-pager),
  which flows into `FocusSubject.format` and the model intro. Step 3 renders one
  live **persona card per segment** (colored avatar, editable name, "how", a
  share bar in the segment's color, a headcount stepper, "% of the room"), an
  "Add a segment" card, and a live recipe banner — all re-derive as the user
  changes industry (`autoSegments`), size preset (`scaleSegments`), or edits.
  For the **website** kind there are two site modes: "React to a screenshot"
  (paste a URL → `/api/screenshot` headless-captures it, or upload one; whole
  panel reacts to that one view) and "Send the panel through the site" — a live
  **walkthrough** where a small hard-capped party (`WALK_MAX` 6) of persona-agents
  each drives its own headless browser through the site. `lib/browser.ts` is the
  shared Chromium launcher (serverless `@sparticuz/chromium` / local
  `/opt/pw-browsers/chromium`); `lib/browse.ts` `BrowseSession` is the per-agent
  session (goto with `assertPublicUrl` re-guarded on every navigation, a
  set-of-marks clickables collector with numbered on-screen badges, click/scroll/
  back, viewport screenshots). `app/api/focus-walk/route.ts` runs the per-persona
  agentic loop: each step it sends the current screenshot + numbered element list
  and the model returns `{thought, action: click|scroll|back|done, index}` in
  character; steps capped (`WALK_STEPS` 5, time-budgeted), then it synthesizes the
  normal focus reaction from the journey it took. Each reaction carries a
  `journey: WalkStep[]`; the UI shows the hop path on the persona card and the full
  click-by-click trail (action + target + in-character thought) in the modal.
  Client fans out at `WALK_CONCURRENCY` 2; a failed walk falls back to a
  deterministic `focusDemo` + synthesized demo journey so the room stays full.
- RFP Simulator (`lib/rfp.ts`, `lib/rfpsim.ts`, `app/api/rfp-eval/route.ts`,
  `app/rfp/page.tsx`): sales-side "will this proposal win?" — paste the RFP + your
  draft response + deal context, and an editable buying committee (Economic Buyer,
  Technical Evaluator, Procurement, Champion, Security & Legal — weighted) scores
  it. `evaluateRfp` is a deterministic engine (no Math.random): six criteria
  (fit/differentiation/proof/value/risk/clarity) scored from proposal-text signals
  (RFP-term coverage, differentiation/proof/pricing/security cues, structure),
  rolled up by committee weights into a win-likelihood % + verdict, per-evaluator
  reads (score/concern/what-would-win-them), gaps, and prioritized fixes. Deterministic
  fallback = demo/no-key; a key upgrades to a model read (`coerce` merges it onto
  the known criteria/evaluators). Results: win-likelihood hero, scorecard bars,
  committee reads, gaps + fixes.
- All five model routes call the shared `lib/anthropic.ts` `callModel()` helper,
  which retries transient failures (429/529/5xx) with backoff and enforces a
  per-attempt timeout. The client surfaces the real error (not a canned "check
  your key") and distinguishes auth vs rate-limit causes. The run route also
  validates/coerces model output against the known enums/ranges before it reaches
  the tally + stats, and puts server-authored identity fields after the spread.
- Deployed on Vercel. No database in v1 — results live in client state. The A/B
  tool exports a run as JSON (with a reproducibility manifest) via `lib/export.ts`,
  a Markdown report, and print-to-PDF. The `/test` page opens as a "simulation
  builder" (header "Build a message simulation" + a live recipe banner that
  summarizes what will run); there is no localStorage run history (the old
  "Past runs" strip + `lib/runstore.ts` were removed).
- Persona simulation: `app/api/run/route.ts` is a serverless route called once per
  reaction (client fans out, concurrency 4). It conditions Claude on a persona/
  archetype's dimensions (system prompt) and returns questionnaire answers as strict JSON.
- Industry "bots" (`lib/archetypes.ts`): the A/B test panel is now industry-specific
  audience archetypes (e.g. e-commerce: Bargain Hunter, Brand Loyalist, …), a few
  instances each (~20 reactions), plus a shared team of analyst bots (Conversion,
  Trust, Accessibility, Copy, Brand). Picking an industry (`lib/industries.ts`) swaps
  the archetype panel. Step 1 is an interactive "Meet your panel" builder: the
  archetypes auto-fill as editable **segments** (`PanelSegment`: name/how/base/count
  via `autoSegments`/`scaleSegments`), each with a headcount the user can dial,
  rename, remove, or add to. A size preset (Focus group 12 / Panel 48 / Audience
  250 / Big panel 1000) scales the whole panel proportionally and a live recipe
  banner reads "This is a {N}-person {industry} panel…". `buildPanelFromSegments`
  turns the segments into the fan-out. Live model runs simulate a representative
  sample capped at LIVE_MAX (120); demo simulates the whole panel deterministically
  (the reactions list renders at most DISPLAY_MAX). Results break down per segment.
- `lib/samples.ts`: per-industry A/B sample copy (`sampleFor`), industry message-type
  lists, and `isPristineCopy` (guards live runs against untouched sample copy and
  safely refills on industry switch). `app/api/draft/route.ts` powers auto-craft:
  Claude drafts two strategically-contrasting A/B versions for the industry + message
  type. The message is now drafted **behind the scenes** — a debounced effect
  auto-crafts when industry/message/asset settle (skips first mount, dedupes the
  combo, latches off silently on no-key, never clobbers hand-edited copy via a
  `copyDirty` flag). Step 2 ("The message") has a source toggle: "Draft it for me"
  (auto, behind the scenes, with a collapsed read-only preview) or "Write, paste
  or upload" — per-version label + textarea + file upload (.txt/.eml/.md/.html,
  `parseEmailText` strips headers/markup and lifts the subject into the label).
  Website assets keep their screenshot upload. Either way the two tested versions'
  full copy is revealed in the results ("The messages tested" card, winner
  highlighted, copy-to-clipboard).
- Analysis: `app/api/analyze/route.ts` takes the panel results + industry and returns
  a decision-ready report (verdict, headline, exec summary, per-segment drivers,
  prioritized actions, per-analyst reads). `lib/analysis.ts` has the type + a
  deterministic `demoAnalysis` so demo mode renders the full report with no API call.
  Results are shown as a verdict hero + stat tiles + tabs (Summary / By segment /
  Analysts / Reactions / Data) to keep them scannable instead of one long scroll.
- The MatrAIx-donor persona panel (`lib/personas.json`) is legacy for the A/B tool
  now that it uses industry archetypes; kept for reference/roadmap.
- Asset types (`lib/types.ts`): email / direct_mail / social / website. Intent keys are
  channel-neutral (dismiss, engage_no_gift, save_for_later, give_*) with per-channel
  display labels and per-channel questionnaire wording in the route. Website tests
  send two screenshots as vision inputs; the client downscales uploads to ≤1568px
  long edge JPEG before the fan-out so payloads stay small. Social posts add
  per-version engagement (`likeA/B`, `commentA/B`, `shareA/B` booleans on
  `PersonaResult`): the run route asks each persona whether they'd like/comment/
  share each version (schema + coercion only when social), demo derives them
  deterministically (likes common → comments → shares rarest), and the results
  show a social-only "Predicted social engagement" card — a mock post footer
  (♥/💬/↗ counts per version) plus per-metric A-vs-B comparison bars.
- Requires `ANTHROPIC_API_KEY` env var (Vercel project settings). Optional
  `MESSAGE_LAB_MODEL` override; defaults to claude-sonnet-4-6.
- `lib/personas.json`: 24 personas exported from the MatrAIx dev sample
  (github.com/MatrAIx-ai/MatrAIx-Persona-8B), stratified by `lstyle_giving`:
  6 each of Regular donor / Occasional / Rare / Never. Seeded sample (seed 4242).
- `lib/demo.ts`: deterministic demo results (no API calls) — powers the
  "Load demo results" button for zero-cost demos. No Math.random anywhere.
- `lib/refine.ts` + `app/api/refine/route.ts`: auto-refinement loop (email /
  direct mail only). Claude diagnoses a round's results and drafts a challenger
  to replace the losing version; client re-runs the panel up to
  `MAX_REFINE_ROUNDS` (10) rounds/click, with a live session cost meter and a soft
  confirm before it gets expensive,
  stopping when the champion holds. Carries the shared-backbone caveat in the UI.
- `app/leads` (Lead Personalization — webinar follow-up): a third tool that turns a
  webinar attendee list into a prioritized work queue. For each lead, an audience
  simulation builds a synthetic behavioral *cohort* of similar prospects and runs
  every follow-up strategy (insight / conversation / resource / takeaway / meeting /
  next-webinar, plus a "wait" floor) against it, scoring each on an engagement funnel
  (ignore→skim→read→click→reply→continue→meeting, unsubscribe as a negative exit).
  Diane sees a recommendation card (winning strategy, confidence, plain-English why,
  See Why factor readout, Compare Approaches) then the drafted email to review/approve.
  `lib/leads.ts` (types, sample webinar+leads, engagement score/tier, strategy catalog,
  `recommendedNextStep`, `buildLeadCohort`), `lib/leadsim.ts` (deterministic
  `simulateStrategy` + `recommend`, family-based confidence), `lib/leademail.ts`
  (per-strategy deterministic drafts) + `app/api/lead-email/route.ts` (AI draft in
  Diane's AGP voice, deterministic fallback with no key). All simulation is
  deterministic (fnv1a, no Math.random) so it runs with no API key. Phase 1 of a
  larger spec; group/cadence/adaptive/results-calibration are later phases.
  Both the webinar and each attendee are editable in-app (scenario dials + Add
  attendee) so it doubles as a what-if / focus-group sandbox; nothing is
  nonprofit-specific but the seed data/copy.
- Email Review Agents (`lib/reviewers.ts`, `lib/emailreview.ts`,
  `app/api/email-review/route.ts`): an editable preset panel of reviewer agents
  (Brand Voice, Copy, Deliverability, Conversion, Empathy) critiques uploaded/
  pasted PAST emails (heuristic scoring — spam/jargon/generic/links/you-vs-we
  density, no Math.random) and distills a reusable `EmailBaseline` (voice/dos/
  donts/structure/subject). Saving the baseline conditions `/api/lead-email`
  drafting (`baselineToPrompt`), so new follow-ups build on what already works.
  Deterministic fallback = demo/no-key path; a key upgrades to a model read.
  `lib/emailrewrite.ts` is a deliberately CONSERVATIVE brand proofreader (full
  editorial policy — preserve author voice/tone/CTA/positioning; protect brand
  terms, acronyms, names, numbers, links, personalization). Auto-applies only
  objective fixes (spelling, grammar, duplicate words, punctuation/spacing,
  `!!!`→`!`, promotional ALL-CAPS via a PROMO_CAPS set with an ACRONYMS allowlist
  protected) and FLAGS everything subjective (urgency/promo phrasing, wordiness,
  long sentences, weak link text) rather than rewriting it. Each change carries
  Category + Confidence + a rule-tied reason; High/Medium apply, Low only flags.
  Shown per email as an Original→Revised diff + a reasoned change/flag list.
- `app/review` + `app/api/review/route.ts`: standalone "Review a page" tool
  (linked from the header nav). Paste a URL → the route screenshots it headless
  (puppeteer-core + @sparticuz/chromium on Vercel; a local Chromium via
  CHROME_PATH / `/opt/pw-browsers/chromium` in dev) → Claude returns a structured
  expert UI/UX critique (scores, strengths, severity-ranked fixes). Screenshot
  upload is the fallback when a site blocks headless capture. Distinct from the
  A/B panel — a single-page design crit, not a persona simulation.
  `next.config.mjs` marks the chromium packages `serverExternalPackages`.
- `lib/stats.ts`: Wilson score intervals — headline give-rates show a 95% CI so
  n≈24 counts aren't read as precise. Methodology grounded in the MatrAIx paper
  (arXiv 2608.04205): persona-agent results are model-dependent and
  hypothesis-generating, so the run route alternates A/B presentation order per
  persona (FNV hash of id), echoes the model + order into each result, and the
  export embeds a run manifest. Caveats on the dashboard state this honestly.
- Charts in `components/Charts.tsx` are hand-rolled SVG. Series colors are
  validated for colorblind safety: Version A = #3b6ea5 (blue), Version B =
  #65a30d (green). Don't swap them for brand colors without re-validating.

## Brand / style conventions

- AGP-branded look: near-black navy (#0f172a) header, lime/chartreuse (#a3e635)
  accent. Keep these for UI chrome; chart series colors stay as validated above.
- Barry's working style: maximum brevity, executive utility, no scope creep.
  Prefer small focused changes over rewrites.

## Commands

- `npm run dev` — local dev (use `.env.local` with ANTHROPIC_API_KEY)
- `npm run build` — must pass before any push
- Demo mode needs no key.

## Upstream engine

The research-grade pilot lives in the MatrAIx repo (separate, not in this repo):
task `application/tasks/agp-survey_appeal-pretest`, config
`configs/jobs/agp-appeal-pretest-pilot.yaml`, docs in `AGP-PILOT-RUNBOOK.md` there.
This app is the lightweight v1; large or rigorous runs graduate to that harness.

## Roadmap (agreed, not yet built)

1. Persist runs in Supabase → shareable result URLs
2. Custom persona panels (size, segment mix, MatrAIx 1M public dataset)
3. Side-by-side comparison of runs across campaigns
4. Worker service running the full MatrAIx harness for research-grade runs
