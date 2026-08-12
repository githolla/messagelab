// Faithfulness / grounding check. Adapted from MatrAIx's persona_grounding
// idea: catch reactions where the simulation broke down, and report a panel-
// level faithfulness rate so a run's trustworthiness is visible.
//
// MatrAIx keys its check on counterfactual language against known persona
// dimensions (e.g. an "18-24" persona mentioning "retirement"). Our lead
// personas don't carry ages, so we check what we CAN observe generically:
// degenerate output (too short / boilerplate), internal contradictions, and
// out-of-range ratings. Purely deterministic — no extra API calls.

const INTENT_RANK = {
  dismiss: 0,
  read_no_reply: 1,
  save_for_later: 2,
  reply_low: 3,
  reply_clear: 4,
  reply_hot: 5,
};

// Phrases that suggest the model answered as an assistant instead of in character.
const BREAK_CHARACTER = [
  /as an ai/i,
  /as a language model/i,
  /i cannot|i can't help/i,
  /simulat/i,
  /persona/i,
  /as this (person|persona|archetype)/i,
];

function rank(intent) {
  return INTENT_RANK[intent] == null ? -1 : INTENT_RANK[intent];
}

/**
 * Check a single reaction for signs it isn't a faithful in-character answer.
 * @returns {{faithful: boolean, issues: string[]}}
 */
export function checkReaction(r) {
  const issues = [];
  const rationale = String(r.rationale || "").trim();

  if (rationale.length < 15) issues.push("rationale too short to be a real reaction");
  if (BREAK_CHARACTER.some((re) => re.test(rationale))) issues.push("broke character / meta language");

  for (const k of ["resonanceA", "resonanceB", "baselineIntent"]) {
    const v = Number(r[k]);
    if (!Number.isFinite(v) || v < 1 || v > 5) issues.push(`${k} out of 1-5 range`);
  }

  // Winner should not contradict the intents: if the model voted for a version
  // whose intent is clearly lower than the other, the answer is incoherent.
  const rA = rank(r.intentA);
  const rB = rank(r.intentB);
  if (r.winner === "send_a" && rA >= 0 && rB >= 0 && rA < rB - 1) {
    issues.push("voted A but intent A is much lower than B");
  }
  if (r.winner === "send_b" && rA >= 0 && rB >= 0 && rB < rA - 1) {
    issues.push("voted B but intent B is much lower than A");
  }

  return { faithful: issues.length === 0, issues };
}

/**
 * Run the check across a panel. Tags each result with `_quality` and returns a
 * summary. Duplicate-rationale detection catches a model producing the same
 * canned answer for every persona (a classic simulation-collapse signal).
 * @param {Array} results - reaction results (mutated in place with `_quality`)
 * @returns {{faithfulnessRate: number, flagged: number, duplicateRationaleRate: number, total: number}}
 */
export function groundPanel(results) {
  const seen = new Map();
  for (const r of results) {
    const key = String(r.rationale || "").trim().toLowerCase();
    seen.set(key, (seen.get(key) || 0) + 1);
  }

  let flagged = 0;
  let duplicated = 0;
  for (const r of results) {
    const q = checkReaction(r);
    const key = String(r.rationale || "").trim().toLowerCase();
    const isDup = key.length > 0 && seen.get(key) > 1;
    if (isDup) {
      duplicated++;
      q.issues.push("rationale duplicated across personas");
      q.faithful = false;
    }
    r._quality = q;
    if (!q.faithful) flagged++;
  }

  const total = results.length || 1;
  return {
    total: results.length,
    flagged,
    faithfulnessRate: Number(((results.length - flagged) / total).toFixed(3)),
    duplicateRationaleRate: Number((duplicated / total).toFixed(3)),
  };
}
