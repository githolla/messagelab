# Message Lab — project context

Donor appeal pre-testing app for AGP (Allegiance Group + Pursuant), built by Barry
Medley with Nine-67. Test two variants of a donor-facing asset — email, direct mail
letter, or website UI (screenshots) — against a simulated donor persona panel, view
a segment-level results dashboard. "Message Lab" is a working title.

## Architecture

- Next.js 15 App Router, TypeScript, no CSS framework (hand-rolled `app/globals.css`).
- Deployed on Vercel. No database in v1 — results live in client state with JSON export.
- Persona simulation: `app/api/run/route.ts` is a serverless route called once per
  reaction (client fans out, concurrency 4). It conditions Claude on a persona/
  archetype's dimensions (system prompt) and returns questionnaire answers as strict JSON.
- Industry "bots" (`lib/archetypes.ts`): the A/B test panel is now industry-specific
  audience archetypes (e.g. e-commerce: Bargain Hunter, Brand Loyalist, …), a few
  instances each (~20 reactions), plus a shared team of analyst bots (Conversion,
  Trust, Accessibility, Copy, Brand). Picking an industry (`lib/industries.ts`) swaps
  the archetype panel and both are previewed as cards before running.
- Analysis: `app/api/analyze/route.ts` takes the panel results + industry and returns
  a decision-ready report (verdict, headline, exec summary, per-segment drivers,
  prioritized actions, per-analyst reads). `lib/analysis.ts` has the type + a
  deterministic `demoAnalysis` so demo mode renders the full report with no API call.
  Results are shown as a verdict hero + stat tiles + tabs (Summary / By segment /
  Analysts / Reactions / Data) to keep them scannable instead of one long scroll.
- The MatrAIx-donor persona panel (`lib/personas.json`) is legacy for the A/B tool
  now that it uses industry archetypes; kept for reference/roadmap.
- Asset types (`lib/types.ts`): email / direct_mail / website. Intent keys are
  channel-neutral (dismiss, engage_no_gift, save_for_later, give_*) with per-channel
  display labels and per-channel questionnaire wording in the route. Website tests
  send two screenshots as vision inputs; the client downscales uploads to ≤1568px
  long edge JPEG before the fan-out so payloads stay small.
- Requires `ANTHROPIC_API_KEY` env var (Vercel project settings). Optional
  `MESSAGE_LAB_MODEL` override; defaults to claude-sonnet-4-6.
- `lib/personas.json`: 24 personas exported from the MatrAIx dev sample
  (github.com/MatrAIx-ai/MatrAIx-Persona-8B), stratified by `lstyle_giving`:
  6 each of Regular donor / Occasional / Rare / Never. Seeded sample (seed 4242).
- `lib/demo.ts`: deterministic demo results (no API calls) — powers the
  "Load demo results" button for zero-cost demos. No Math.random anywhere.
- `lib/refine.ts` + `app/api/refine/route.ts`: auto-refinement loop (email /
  direct mail only). Claude diagnoses a round's results and drafts a challenger
  to replace the losing version; client re-runs the panel up to 3 rounds/click,
  stopping when the champion holds. Carries the shared-backbone caveat in the UI.
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
