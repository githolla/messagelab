// Stage 2 — the core reaction. One Claude call per persona: condition the model
// on a single lead persona (system prompt) and both email versions (user
// prompt), and return that persona's questionnaire answers as strict JSON.
//
// Email-only. Ported from Message Lab's app/api/run/route.ts, with the direct-
// mail and website/vision branches removed and the intent vocabulary reframed
// for sales-reply (lead response) instead of fundraising.

import { callClaude, extractJson } from "./anthropic.js";

const SCHEMA_HINT = `Respond with ONLY a JSON object, no markdown fences, matching:
{
  "intentA": "dismiss" | "read_no_reply" | "save_for_later" | "reply_low" | "reply_clear" | "reply_hot",
  "intentB": same options as intentA,
  "resonanceA": 1-5,
  "resonanceB": 1-5,
  "trust": "version_a" | "version_b" | "both_equal" | "neither",
  "winner": "send_a" | "send_b" | "either" | "neither",
  "rationale": "1-2 sentences quoting or describing the specific line that moved you or put you off",
  "baselineIntent": 1-5
}`;

const QUESTIONNAIRE = `## Questionnaire

1. intentA — If Version A landed in your inbox as a reply to your enquiry, what would you most likely do?
   Options: "dismiss" = delete it unread; "read_no_reply" = read it but not respond; "save_for_later" = keep it to maybe act on later; "reply_low" = reply but only mildly interested; "reply_clear" = reply with clear intent to move forward; "reply_hot" = reply eagerly, ready to book/buy or go further.
2. intentB — Same question for Version B.
3. resonanceA — How compelling was Version A? (1 = not at all, 5 = extremely)
4. resonanceB — Same for Version B.
5. trust — Which version made the company feel more trustworthy?
6. winner — If only one reply could be sent to you, which should it be?
7. rationale — What most drove your winner choice? Quote or describe the specific line.
8. baselineIntent — How likely are you to act on this kind of outreach at all right now, regardless of these versions? (1-5)

${SCHEMA_HINT}`;

// Deterministic per-persona A/B presentation order (FNV-1a hash of the id).
// Half the panel sees B first, countering primacy/position bias in this
// within-subject head-to-head. Deterministic so reruns reproduce.
function presentationOrder(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? "ab" : "ba";
}

function personaBlock(p) {
  const dims = Object.entries(p.dimensions)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `You are answering as this person. Stay fully in character — react the way THIS person would, not the way an average or agreeable person would.\n\nname: ${p.name}\n${dims}`;
}

/**
 * React one persona to two email versions.
 * @param {object} persona  - { id, name, segment, dimensions: {...} }
 * @param {object} variants - { labelA, labelB, copyA, copyB }
 * @param {object} opts     - { apiKey, model? }
 * @returns {Promise<object>} a reaction result (intent A/B, resonance, winner, ...)
 */
export async function reactToVariants(persona, variants, opts) {
  const { apiKey, model = "claude-sonnet-4-6" } = opts;
  const order = presentationOrder(persona.id);

  const A = { label: `## Version A — "${variants.labelA}"`, copy: variants.copyA };
  const B = { label: `## Version B — "${variants.labelB}"`, copy: variants.copyB };
  const [first, second] = order === "ab" ? [A, B] : [B, A];

  const preamble = `Two versions of a sales reply email are being tested. React to both, then answer the questionnaire honestly as yourself. "I would ignore this" and low ratings are valid answers. Judge each version on its own merits — there is no expected "right" answer, and preferring neither is fine.`;

  const content = `${preamble}

${first.label}

${first.copy}

${second.label}

${second.copy}

${QUESTIONNAIRE}`;

  const text = await callClaude({
    apiKey,
    model,
    maxTokens: 1024,
    system: personaBlock(persona),
    messages: [{ role: "user", content }],
  });

  const parsed = extractJson(text);
  return {
    personaId: persona.id,
    personaName: persona.name,
    segment: persona.segment,
    ...parsed,
    model,
    order,
  };
}
