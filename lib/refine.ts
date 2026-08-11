import type { PersonaResult } from "./types";

export interface RoundSummary {
  labelA: string;
  labelB: string;
  votesA: number;
  votesB: number;
  givesA: number;
  givesB: number;
  neither: number;
  /** Diagnosis produced from this round's results (feeds the next challenger). */
  diagnosis?: string;
}

export const GIVE_INTENTS = ["give_small", "give_suggested", "give_more"];

export function tally(results: PersonaResult[]) {
  return {
    votesA: results.filter((r) => r.winner === "send_a").length,
    votesB: results.filter((r) => r.winner === "send_b").length,
    givesA: results.filter((r) => GIVE_INTENTS.includes(r.intentA)).length,
    givesB: results.filter((r) => GIVE_INTENTS.includes(r.intentB)).length,
    neither: results.filter((r) => r.winner === "neither").length,
  };
}
