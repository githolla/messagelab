# Message Lab — project context

Donor appeal pre-testing app for AGP (Allegiance Group + Pursuant), built by Barry
Medley with Nine-67. Paste two fundraising appeal variants, run them against a
simulated donor persona panel, view a segment-level results dashboard. "Message Lab"
is a working title.

## Architecture

- Next.js 15 App Router, TypeScript, no CSS framework (hand-rolled `app/globals.css`).
- Deployed on Vercel. No database in v1 — results live in client state with JSON export.
- Persona simulation: `app/api/run/route.ts` is a serverless route called once per
  persona (client fans out, concurrency 4). It conditions Claude on a persona's
  dimensions (system prompt) and returns questionnaire answers as strict JSON.
- Requires `ANTHROPIC_API_KEY` env var (Vercel project settings). Optional
  `MESSAGE_LAB_MODEL` override; defaults to claude-sonnet-4-6.
- `lib/personas.json`: 24 personas exported from the MatrAIx dev sample
  (github.com/MatrAIx-ai/MatrAIx-Persona-8B), stratified by `lstyle_giving`:
  6 each of Regular donor / Occasional / Rare / Never. Seeded sample (seed 4242).
- `lib/demo.ts`: deterministic demo results (no API calls) — powers the
  "Load demo results" button for zero-cost demos. No Math.random anywhere.
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
