// Zero-backend run history: completed runs are persisted to localStorage so a
// strategist can look back across a campaign and compare variants, without
// waiting on the Supabase work on the roadmap. Each entry keeps enough to both
// show a summary strip and fully reload the run into the dashboard.

import type { AssetType, PersonaResult, Variants } from "./types";
import type { Analysis } from "./analysis";
import type { Verdict } from "./analysis";
import type { CohortFacets } from "./cohort";

const KEY = "messagelab.runs.v1";
const MAX_RUNS = 12;

export interface StoredRun {
  id: string;
  createdAt: string; // ISO
  industryKey: string;
  industryLabel: string;
  assetType: AssetType;
  isDemo: boolean;
  verdict: Verdict | null;
  labelA: string;
  labelB: string;
  n: number;
  gA: number;
  gB: number;
  confidence: string | null; // label only, for the strip
  // Full payload for reload:
  variants: Variants;
  results: PersonaResult[];
  analysis: Analysis | null;
  model: string | null;
  facets?: CohortFacets;
  cohortText?: string;
}

/** Summary shape for the "Past runs" strip (everything but the heavy payload). */
export type RunSummary = Omit<StoredRun, "variants" | "results" | "analysis">;

function read(): StoredRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredRun[]) : [];
  } catch {
    return [];
  }
}

function write(runs: StoredRun[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    // Quota exceeded or storage disabled — drop the oldest and try once more.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, Math.max(1, MAX_RUNS - 4))));
    } catch {
      /* give up silently — history is best-effort */
    }
  }
}

export function listRuns(): StoredRun[] {
  return read().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function saveRun(run: StoredRun): StoredRun[] {
  const runs = [run, ...read().filter((r) => r.id !== run.id)];
  write(runs);
  return listRuns();
}

export function getRun(id: string): StoredRun | undefined {
  return read().find((r) => r.id === id);
}

export function removeRun(id: string): StoredRun[] {
  write(read().filter((r) => r.id !== id));
  return listRuns();
}

export function clearRuns(): StoredRun[] {
  write([]);
  return [];
}

/** Stable, dependency-free id (no Math.random requirement at module load). */
export function newRunId(seed: string): string {
  return `run_${Date.now().toString(36)}_${seed.replace(/[^a-z0-9]/gi, "").slice(0, 6)}`;
}
