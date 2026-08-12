// Small shared helpers used across the app so the same logic isn't hand-rolled
// (and allowed to drift) in several files.

import type { PersonaResult } from "./types";

/** FNV-1a hash of a string → 32-bit unsigned int. Deterministic, no Math.random. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Same hash, mapped to a stable float in [0, 1). */
export function fnv1aFloat(s: string): number {
  return fnv1a(s) / 4294967296;
}

/** Unique giving/segment values, preserving first-seen order. */
export function orderedSegments(results: PersonaResult[]): string[] {
  const seen: string[] = [];
  for (const r of results) if (!seen.includes(r.giving)) seen.push(r.giving);
  return seen;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// Rough cost estimate for a run, so users see spend before it happens. A
// persona reaction is ~1.2k in + ~0.4k out tokens at Sonnet-class pricing
// (~$3/Mtok in, ~$15/Mtok out) ≈ $0.01 each; analysis/refine add ~$0.03.
// Deliberately conservative and labelled "approx" in the UI.
const COST_PER_REACTION = 0.011;
const COST_PER_ANALYSIS = 0.03;

export function estimateRunCost(panelSize: number, withAnalysis = true): number {
  return panelSize * COST_PER_REACTION + (withAnalysis ? COST_PER_ANALYSIS : 0);
}

/** "$0.28" / "<$0.01" — a compact dollar string for the cost meter. */
export function formatCost(dollars: number): string {
  if (dollars <= 0) return "$0.00";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}
