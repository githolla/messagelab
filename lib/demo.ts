import type { IntentChoice, Persona, PersonaResult } from "./types";
import { fnv1a, fnv1aFloat, clamp } from "./util";

function intentFrom(score: number): IntentChoice {
  if (score < 0.18) return "dismiss";
  if (score < 0.42) return "engage_no_gift";
  if (score < 0.55) return "save_for_later";
  if (score < 0.7) return "give_small";
  if (score < 0.9) return "give_suggested";
  return "give_more";
}

// Industry/channel-neutral rationales, keyed off the demo winner — so a demo of
// a SaaS or e-commerce message doesn't surface food-bank donation quotes.
// Several options per outcome, picked deterministically so the room reads varied.
const RATIONALE_BANK: Record<PersonaResult["winner"], string[]> = {
  send_a: [
    "Version A's angle spoke to what I actually care about — it felt written for me, not at me.",
    "A led with the thing that matters to me and made the next step obvious. That's what won me over.",
    "A had more warmth and a clearer story — I could picture myself acting on it.",
    "The opening of A hooked me before I lost interest. B took too long to get going.",
    "A felt human. It gave me a reason, not just a pitch.",
    "I trusted A more — it didn't oversell, and the ask felt reasonable.",
  ],
  send_b: [
    "Version B was the clearer, more concrete pitch — the specifics are what moved me.",
    "B got to the point and backed it up. A was warmer but vaguer, so B is the one I'd act on.",
    "The numbers in B made it feel real. A was nice but I couldn't tell what I'd actually get.",
    "B respected my time — it told me the offer up front and I knew exactly what to do.",
    "I'm skeptical by default, and B gave me proof. A just asked me to feel something.",
    "B's call to action was sharper. I'd click it; A I'd probably skim and forget.",
  ],
  either: [
    "Honestly both were close for me — the underlying offer matters more than the wording here.",
    "Neither pulled ahead. If the offer's the same, I'd act on whichever I saw first.",
    "They're two versions of the same idea to me. Either would work.",
    "I liked bits of each — A's tone, B's specifics. Together they'd be strong.",
  ],
  neither: [
    "Neither one gave me a strong enough reason to act right now — I'd move on.",
    "I see a lot of these. Nothing here made me stop and do something about it.",
    "Both felt like marketing. I'd need a clearer benefit before I'd engage.",
    "Not the right moment for me — neither version changed that.",
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

  const bank = RATIONALE_BANK[winner];
  const pick = bank[fnv1a(p.id + "r") % bank.length];

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
