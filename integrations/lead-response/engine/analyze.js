// Stage 3 — analyze. One Claude call that turns the whole panel's reactions
// (plus deterministic tallies computed here) into a decision-ready report:
// verdict, headline, executive summary, per-segment drivers, prioritized
// actions, and per-analyst reads.
//
// Ported from Message Lab's app/api/analyze/route.ts, email-only and reframed
// for lead response.

import { callClaude, extractJson } from "./anthropic.js";

/** The specialist "analyst" lenses that interpret the panel. Edit freely. */
export const ANALYSTS = [
  { key: "conversion", label: "Conversion", lens: "the CTA, friction, and what actually moves a reply" },
  { key: "trust", label: "Trust", lens: "credibility, proof, and risk cues" },
  { key: "copy", label: "Copy", lens: "message clarity, tone, and specificity" },
  { key: "relevance", label: "Relevance", lens: "how well the reply matches the lead's intent and moment" },
];

const INTENT_LABELS = {
  dismiss: "Delete unread",
  read_no_reply: "Read, no reply",
  save_for_later: "Save for later",
  reply_low: "Reply, low intent",
  reply_clear: "Reply, clear intent",
  reply_hot: "Reply, hot",
};
const INTENT_ORDER = [
  "dismiss",
  "read_no_reply",
  "save_for_later",
  "reply_low",
  "reply_clear",
  "reply_hot",
];
// Which intents count as "would reply" for the headline metric.
const REPLY_INTENTS = ["reply_low", "reply_clear", "reply_hot"];

function mean(xs) {
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–";
}

function segmentsOf(results) {
  const seen = [];
  for (const r of results) if (!seen.includes(r.segment)) seen.push(r.segment);
  return seen;
}

/** Deterministic head-to-head + reply counts. Exposed for storing/UIs. */
export function tally(results) {
  const votesA = results.filter((r) => r.winner === "send_a").length;
  const votesB = results.filter((r) => r.winner === "send_b").length;
  const neither = results.filter((r) => r.winner === "neither").length;
  const repliesA = results.filter((r) => REPLY_INTENTS.includes(r.intentA)).length;
  const repliesB = results.filter((r) => REPLY_INTENTS.includes(r.intentB)).length;
  return { votesA, votesB, neither, either: results.length - votesA - votesB - neither, repliesA, repliesB };
}

function buildSummary(results) {
  const t = tally(results);
  const intentLine = (k) =>
    INTENT_ORDER.map((i) => `${INTENT_LABELS[i]}: ${results.filter((r) => r[k] === i).length}`).join(", ");
  const segLines = segmentsOf(results)
    .map((g) => {
      const rs = results.filter((r) => r.segment === g);
      const rA = rs.filter((r) => REPLY_INTENTS.includes(r.intentA)).length;
      const rB = rs.filter((r) => REPLY_INTENTS.includes(r.intentB)).length;
      return `  ${g} (n=${rs.length}): resonance A ${mean(rs.map((r) => r.resonanceA))} / B ${mean(
        rs.map((r) => r.resonanceB)
      )}; would-reply A ${rA} / B ${rB}`;
    })
    .join("\n");
  const quotes = results
    .slice(0, 20)
    .map((r) => `  [${r.segment}, voted ${r.winner}] ${r.rationale}`)
    .join("\n");

  return `Panel: ${results.length} simulated reactions across ${segmentsOf(results).length} lead archetypes.
Head-to-head votes: A ${t.votesA}, B ${t.votesB}, either ${t.either}, neither ${t.neither}.
Would reply: A ${t.repliesA}, B ${t.repliesB}.
Intent distribution A: ${intentLine("intentA")}
Intent distribution B: ${intentLine("intentB")}
By archetype (resonance A/B; would-reply A/B):
${segLines}
Reaction rationales:
${quotes}`;
}

/**
 * Analyze a completed panel into a decision report.
 * @param {object} variants - { labelA, labelB, copyA, copyB }
 * @param {Array}  results  - reaction results from reactToVariants()
 * @param {object} opts     - { apiKey, model?, context? }
 * @returns {Promise<{analysis: object, model: string, tally: object}>}
 */
export async function analyzePanel(variants, results, opts) {
  const { apiKey, model = "claude-sonnet-4-6", context = "" } = opts;
  if (!results || !results.length) throw new Error("No results to analyze.");

  const analystList = ANALYSTS.map((a) => `- ${a.key} (${a.label}): ${a.lens}`).join("\n");
  const analystKeys = ANALYSTS.map((a) => a.key).join(", ");

  const schema = `Respond with ONLY a JSON object, no markdown fences:
{
  "verdict": "ship_a" | "ship_b" | "rework" | "tie",
  "headline": "one punchy sentence — the single most important takeaway",
  "summary": "2-4 sentence executive summary a busy rep can act on",
  "segments": [ {"segment": "archetype name exactly as given", "driver": "what pulled this group toward replying", "barrier": "what held them back", "divergence": "how A vs B differed for them"} ],
  "actions": [ {"priority": "high" | "medium" | "low", "action": "one concrete, specific change to make"} ],
  "analysts": [ {"key": "one of the analyst keys", "read": "1-2 sentence read through that lens, grounded in the data"} ]
}
Include one segments entry per archetype, one analysts entry per analyst key (${analystKeys}), and 3-6 actions ordered most-impactful first. Ground every claim in the numbers or rationales — no generic advice.`;

  const user = `Two versions of a sales reply email were tested against a simulated lead panel. ${context}

## Version A — "${variants.labelA}"
${variants.copyA}

## Version B — "${variants.labelB}"
${variants.copyB}

## Panel results
${buildSummary(results)}

## Your task
You are a panel of specialist analysts:
${analystList}
Interpret the reactions into a decision-ready report. ${schema}`;

  const text = await callClaude({
    apiKey,
    model,
    maxTokens: 2500,
    system:
      "You are a team of senior conversion, trust, copy, and relevance analysts. You turn simulated-lead reactions into a crisp, evidence-driven, decision-ready report. No fluff, no hedging.",
    messages: [{ role: "user", content: user }],
  });

  return { analysis: extractJson(text), model, tally: tally(results) };
}
