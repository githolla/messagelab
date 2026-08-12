import type { IntentChoice, Persona, PersonaResult } from "./types";
import { fnv1aFloat, clamp } from "./util";

function intentFrom(score: number): IntentChoice {
  if (score < 0.18) return "dismiss";
  if (score < 0.42) return "engage_no_gift";
  if (score < 0.55) return "save_for_later";
  if (score < 0.7) return "give_small";
  if (score < 0.9) return "give_suggested";
  return "give_more";
}

// Industry/channel-neutral rationales, keyed off the demo winner — so a demo of
// a SaaS or e-commerce message doesn't surface food-bank donation quotes. Two
// options per outcome, picked deterministically so cards read varied.
const RATIONALE_BANK: Record<PersonaResult["winner"], [string, string]> = {
  send_a: [
    "Version A's angle spoke to what I actually care about — it felt written for me, not at me.",
    "A led with the thing that matters to me and made the next step obvious. That's what won me over.",
  ],
  send_b: [
    "Version B was the clearer, more concrete pitch — the specifics are what moved me.",
    "B got to the point and backed it up. A was warmer but vaguer, so B is the one I'd act on.",
  ],
  either: [
    "Honestly both were close for me — the underlying offer matters more than the wording here.",
    "Neither pulled ahead. If the offer's the same, I'd act on whichever I saw first.",
  ],
  neither: [
    "Neither one gave me a strong enough reason to act right now — I'd move on.",
    "I see a lot of these. Nothing here made me stop and do something about it.",
  ],
};

/**
 * Deterministic demo reaction (no API, no Math.random). The A-vs-B lean is
 * derived from a hash of the archetype AND the copy being tested (`leanKey`),
 * so different archetypes and different copy swing both directions — there is no
 * built-in bias toward Version A.
 */
export function demoResult(p: Persona, baseOverride?: number, leanKey?: string): PersonaResult {
  const base = baseOverride ?? 0.3;
  const lean = (fnv1aFloat(`${p.giving}|lean|${leanKey ?? ""}`) - 0.5) * 0.3;
  const jitterA = (fnv1aFloat(p.id + "a") - 0.5) * 0.24;
  const jitterB = (fnv1aFloat(p.id + "b") - 0.5) * 0.24;
  const scoreA = clamp(base + lean + jitterA, 0, 1);
  const scoreB = clamp(base - lean + jitterB, 0, 1);

  const resonanceA = clamp(Math.round(scoreA * 4 + 1), 1, 5);
  const resonanceB = clamp(Math.round(scoreB * 4 + 1), 1, 5);

  const winner: PersonaResult["winner"] =
    Math.abs(scoreA - scoreB) < 0.06
      ? scoreA + scoreB < 0.4
        ? "neither"
        : "either"
      : scoreA > scoreB
        ? "send_a"
        : "send_b";

  const pick = RATIONALE_BANK[winner][fnv1aFloat(p.id + "r") < 0.5 ? 0 : 1];

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
    rationale: pick,
    baselineIntent: clamp(Math.round(base * 5 + fnv1aFloat(p.id + "c")), 1, 5),
  };
}
