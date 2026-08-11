# Message Lab

Test messages and experiences against a simulated audience before you ship — for any industry.

Two tools:

- **A/B Message Test** — test two versions of an email, direct mail letter, or web page
  (screenshots) against a 24-persona audience panel (MatrAIx persona dataset), and get a
  segment-level readout: winner votes, response intent, emotional resonance, and each
  persona's rationale. Claude then auto-refines the weaker version until results plateau.
- **UX Page Review** — paste any URL; the app screenshots it and Claude returns an expert
  UI/UX and usability review (scores, strengths, severity-ranked fixes), tunable per industry.

## Stack

Next.js (App Router) on Vercel. Persona simulation runs in a serverless API route
calling the Anthropic API — no separate backend for v1. The research-grade
[MatrAIx](https://github.com/MatrAIx-ai/MatrAIx-Persona-8B) Python harness is the
upstream engine this graduates to for larger runs.

## Local dev

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

"Load demo results" renders the full dashboard with deterministic sample data — no
API key needed.

## Deploy (Vercel)

1. Push this repo to GitHub.
2. vercel.com → Add New Project → import the repo (defaults are fine).
3. Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY`.
4. Deploy. Each pre-test run (24 personas) costs a few dollars in API usage.

## Roadmap

- Persist runs (Supabase) so results are shareable by URL
- Custom persona panels (size, segments, 1M-persona dataset)
- Side-by-side run comparison across campaigns
- Graduate execution to the MatrAIx harness on a worker for research-grade runs
