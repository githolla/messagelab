// Auto-refine loop. Ported in concept from Message Lab's refine flow: after a
// run, replace the LOSING version with a Claude-drafted challenger built from
// the analysis, re-test, and repeat until reply intent plateaus (or maxRounds).
// Stops on the "improvement plateau" — when a new challenger no longer raises
// the best reply count by at least `minDelta`.

import { callClaudeJson } from "./anthropic.js";
import { runTest } from "./simulate.js";
import { wordDiff } from "./diff.js";

/** Ask Claude to draft a stronger challenger for the losing version. */
async function draftChallenger({ apiKey, model, variants, analysis, losing, context }) {
  const loserCopy = losing === "A" ? variants.copyA : variants.copyB;
  const winnerCopy = losing === "A" ? variants.copyB : variants.copyA;
  const actions = (analysis.actions || []).map((a) => `- (${a.priority}) ${a.action}`).join("\n");

  const user = `You are rewriting the losing version of a sales reply email so it beats the winner with simulated leads. ${context}

## Winning version (do not just copy it — beat it a different way)
${winnerCopy}

## Losing version (replace this)
${loserCopy}

## What the analysis said to fix
${actions}

Write a stronger replacement for the losing version: a realistic, sendable sales reply email (no placeholders like [name] unless the original used them). Keep it the same rough length. Respond with ONLY:
{ "label": "a 2-4 word name for this version", "copy": "the full email text" }`;

  return callClaudeJson({
    apiKey,
    model,
    maxTokens: 1200,
    system: "You are a senior sales copywriter. You write concise, human, high-reply outreach — no fluff, no obvious templates.",
    messages: [{ role: "user", content: user }],
  });
}

function bestReplies(t) {
  return Math.max(t.repliesA, t.repliesB);
}

/**
 * Run the refine loop.
 * @param {object} variants - initial { labelA, labelB, copyA, copyB }
 * @param {object} opts     - runTest opts plus: maxRounds=3, minDelta=1, onRound(round)
 * @returns {Promise<{rounds: object[], final: object, variants: object}>}
 */
export async function refineLoop(variants, opts) {
  const { apiKey, model = "claude-sonnet-4-6", maxRounds = 3, minDelta = 1, onRound, ...runOpts } = opts || {};
  if (!apiKey) throw new Error("apiKey is required.");

  let current = { ...variants };
  let run = await runTest(current, { apiKey, model, ...runOpts });
  let best = bestReplies(run.tally);

  const rounds = [
    { round: 0, variants: current, tally: run.tally, verdict: run.analysis.verdict, headline: run.analysis.headline, draft: null, demo: run.demo || false },
  ];
  if (onRound) onRound(rounds[0]);

  for (let r = 1; r <= maxRounds; r++) {
    const losing = run.tally.repliesA <= run.tally.repliesB ? "A" : "B";
    let draft;
    try {
      draft = await draftChallenger({ apiKey, model, variants: current, analysis: run.analysis, losing, context: runOpts.context || "" });
    } catch (e) {
      rounds[rounds.length - 1].note = `Refine stopped: could not draft a challenger (${String((e && e.message) || e)}).`;
      break;
    }

    const prevCopy = losing === "A" ? current.copyA : current.copyB;
    const prevLabel = losing === "A" ? current.labelA : current.labelB;
    const next = losing === "A"
      ? { ...current, labelA: draft.label || current.labelA, copyA: draft.copy }
      : { ...current, labelB: draft.label || current.labelB, copyB: draft.copy };

    const nextRun = await runTest(next, { apiKey, model, ...runOpts });
    const nextBest = bestReplies(nextRun.tally);

    const roundRec = {
      round: r,
      replaced: losing,
      variants: next,
      tally: nextRun.tally,
      verdict: nextRun.analysis.verdict,
      headline: nextRun.analysis.headline,
      draft: { version: losing, prevLabel, newLabel: draft.label || prevLabel, prevCopy, newCopy: draft.copy, diff: wordDiff(prevCopy, draft.copy) },
      improvedBy: nextBest - best,
      demo: nextRun.demo || false,
    };
    rounds.push(roundRec);
    if (onRound) onRound(roundRec);

    // Plateau: keep the improvement if it helped, then stop.
    if (nextBest - best < minDelta) {
      if (nextBest > best) {
        current = next;
        run = nextRun;
        best = nextBest;
      }
      roundRec.plateau = true;
      break;
    }

    current = next;
    run = nextRun;
    best = nextBest;
  }

  return { rounds, final: run, variants: current };
}
