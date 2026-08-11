import type { IntentChoice, Persona, PersonaResult } from "./types";
import { INTENT_ORDER } from "./types";

// Deterministic pseudo-random from a string seed (no Math.random — reproducible demos).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const GIVING_BASE: Record<string, number> = {
  "Regular donor": 0.78,
  Occasional: 0.55,
  Rare: 0.32,
  Never: 0.12,
};

function intentFrom(score: number): IntentChoice {
  if (score < 0.18) return "dismiss";
  if (score < 0.42) return "engage_no_gift";
  if (score < 0.55) return "save_for_later";
  if (score < 0.7) return "give_small";
  if (score < 0.9) return "give_suggested";
  return "give_more";
}

export function demoResult(p: Persona): PersonaResult {
  const base = GIVING_BASE[p.giving] ?? 0.3;
  const empathic =
    p.dimensions["cog_empathy_expression"] === "High" ||
    p.dimensions["cog_empathy_expression"] === "Very high" ||
    p.dimensions["big5_altruism"] === "High" ||
    p.dimensions["big5_altruism"] === "Very high";
  const analytic =
    p.dimensions["acad_statistics"] === "Interested" ||
    p.dimensions["cog_precision_of_language"] === "Very precise" ||
    p.dimensions["att_online_reviews"] === "Positive";

  const jitterA = (hash(p.id + "a") - 0.5) * 0.3;
  const jitterB = (hash(p.id + "b") - 0.5) * 0.3;
  const scoreA = Math.max(0, Math.min(1, base + (empathic ? 0.14 : -0.02) + jitterA));
  const scoreB = Math.max(0, Math.min(1, base + (analytic ? 0.12 : -0.04) + jitterB));

  const resonanceA = Math.max(1, Math.min(5, Math.round(scoreA * 4 + (empathic ? 1.4 : 0.8))));
  const resonanceB = Math.max(1, Math.min(5, Math.round(scoreB * 4 + (analytic ? 1.2 : 0.6))));

  const winner =
    Math.abs(scoreA - scoreB) < 0.04
      ? scoreA + scoreB < 0.35
        ? ("neither" as const)
        : ("either" as const)
      : scoreA > scoreB
        ? ("send_a" as const)
        : ("send_b" as const);

  const rationaleBank = {
    send_a: `"The shelf where the canned vegetables usually sit was bare" — that image stuck with me more than any statistic could.`,
    send_b: `"$50 provides 200 meals" told me exactly what my money does. The story version felt manipulative by comparison.`,
    either: `Both landed about the same for me — the match offer ("your gift is doubled") is what actually matters.`,
    neither: `Honestly, I get a dozen of these a month. Neither subject line would have survived my inbox.`,
  };

  return {
    personaId: p.id,
    personaName: p.name,
    giving: p.giving,
    intentA: intentFrom(scoreA),
    intentB: intentFrom(scoreB),
    resonanceA,
    resonanceB,
    trust:
      winner === "send_a"
        ? "version_a"
        : winner === "send_b"
          ? "version_b"
          : winner === "either"
            ? "both_equal"
            : "neither",
    winner,
    rationale: rationaleBank[winner],
    baselineIntent: Math.max(1, Math.min(5, Math.round(base * 5 + hash(p.id + "c")))),
  };
}

export function intentIndex(i: IntentChoice): number {
  return INTENT_ORDER.indexOf(i);
}
