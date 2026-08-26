// The full evaluator roster — all 100 evaluators across families A–G, typed
// and display-ready. `lib/gate/roster.json` is the source of truth (the
// Nine-67 evaluator-roster v1 export); this module types it and adds the
// lookups a UI needs. The roster is NOT a voting panel: families A–C
// enumerate criteria and visibility scopes, D–F are checks (most
// deterministic — D49–D68 + F81–F90 are the ones running in the Gate),
// G runs on the assembled document. Scoring is done by 3–5 judge models
// from disjoint families, never by 100 "voters".

import rosterJson from "./roster.json";
import { GATE_CHECKS } from "./model";

export type EvaluatorFamily = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type EvaluatorRole = "criteria_source" | "lens" | "strategy_selector" | "check" | "meta";
export type EvaluatorKind = "visibility_scope" | "modifier" | "judge_task" | "deterministic" | "small_model";
export type ExecutedBy = "config" | "code" | "small_model" | "judge_pool";

export interface Evaluator {
  id: string; // A01…G100
  family: EvaluatorFamily;
  slug: string;
  name: string;
  brief: string;
  emits: string;
  role: EvaluatorRole;
  kind: EvaluatorKind;
  blocking: boolean;
  costTier: 0 | 1 | 2 | 3;
  selection: "always" | "predicate" | "exactly_one";
  executedBy: ExecutedBy;
}

export interface FamilyDef {
  key: EvaluatorFamily;
  name: string;
  count: number;
  note: string;
}

export interface JudgePoolConfig {
  size: { min: number; max: number };
  rule: string;
  rationale: string;
  sampling: { runsPerCriterion: number; aggregate: string };
  blinding: string[];
  reasoningProtocol: string;
  exclusion: string;
}

interface RawEvaluator {
  id: string;
  family: string;
  slug: string;
  name: string;
  brief: string;
  emits: string;
  role: string;
  kind: string;
  blocking: boolean;
  cost_tier: number;
  selection: string;
  executed_by: string;
}

const raw = rosterJson as unknown as {
  version: string;
  notes: string[];
  judge_pool: {
    size: { min: number; max: number };
    rule: string;
    rationale: string;
    sampling: { runs_per_criterion: number; aggregate: string };
    blinding: string[];
    reasoning_protocol: string;
    exclusion: string;
  };
  families: { key: string; name: string; count: number; note: string }[];
  evaluators: RawEvaluator[];
};

export const ROSTER_VERSION = raw.version;
export const ROSTER_NOTES = raw.notes;

export const JUDGE_POOL: JudgePoolConfig = {
  size: raw.judge_pool.size,
  rule: raw.judge_pool.rule,
  rationale: raw.judge_pool.rationale,
  sampling: { runsPerCriterion: raw.judge_pool.sampling.runs_per_criterion, aggregate: raw.judge_pool.sampling.aggregate },
  blinding: raw.judge_pool.blinding,
  reasoningProtocol: raw.judge_pool.reasoning_protocol,
  exclusion: raw.judge_pool.exclusion,
};

export const FAMILIES: FamilyDef[] = raw.families.map((f) => ({
  key: f.key as EvaluatorFamily,
  name: f.name,
  count: f.count,
  note: f.note,
}));

export const EVALUATORS: Evaluator[] = raw.evaluators.map((e) => ({
  id: e.id,
  family: e.family as EvaluatorFamily,
  slug: e.slug,
  name: e.name,
  brief: e.brief,
  emits: e.emits,
  role: e.role as EvaluatorRole,
  kind: e.kind as EvaluatorKind,
  blocking: e.blocking,
  costTier: e.cost_tier as 0 | 1 | 2 | 3,
  selection: e.selection as Evaluator["selection"],
  executedBy: e.executed_by as ExecutedBy,
}));

export function byFamily(key: EvaluatorFamily): Evaluator[] {
  return EVALUATORS.filter((e) => e.family === key);
}

export const COST_TIER_LABEL: Record<number, string> = {
  0: "Tier 0 · deterministic — free, every save",
  1: "Tier 1 · small model — cheap, every draft",
  2: "Tier 2 · mid model — candidate drafts",
  3: "Tier 3 · frontier — release candidates only",
};

export const ROLE_LABEL: Record<EvaluatorRole, string> = {
  criteria_source: "Criteria source",
  lens: "Lens (modifier)",
  strategy_selector: "Strategy selector",
  check: "Check",
  meta: "Meta / synthesis",
};

export const EXECUTED_BY_LABEL: Record<ExecutedBy, string> = {
  config: "Config — shapes criteria, no runtime call",
  code: "Code — deterministic, zero model calls",
  small_model: "Small model — one cheap pass",
  judge_pool: "Judge pool — the 3–5 scoring models",
};

/** Implementation status of an evaluator inside THIS app's Deterministic Gate. */
export type GateStatus = "built" | "needs_artifact" | "not_wired";
export function gateStatus(id: string): GateStatus | null {
  const check = GATE_CHECKS.find((c) => c.id === id);
  if (!check) return null; // not a gate check (families A–C, E, G)
  if (id === "D68") return "needs_artifact";
  return "built";
}
