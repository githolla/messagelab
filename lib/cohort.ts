// Cohort builder: an optional free-text audience description plus toggleable
// demographic facets. Auto-fills to a general population; the user dials it in.
// Selections condition every panelist (folded into the persona system prompt),
// and each panelist is assigned a concrete demographic drawn from the selection
// so the focus group reads like a real, varied room.

import { fnv1a } from "./util";

export interface CohortFacets {
  age: string[];
  region: string[];
  household: string[];
  behavior: string[];
}

export type FacetKey = keyof CohortFacets;

export const FACET_GROUPS: { key: FacetKey; label: string; options: string[] }[] = [
  { key: "age", label: "Age bracket", options: ["18–24", "25–34", "35–44", "45–54", "55+"] },
  {
    key: "region",
    label: "Region",
    options: ["Urban", "Suburban", "Rural", "North America", "Europe", "Asia-Pacific", "Latin America"],
  },
  { key: "household", label: "Household", options: ["Single", "Partnered", "Parent", "Empty-nester"] },
  {
    key: "behavior",
    label: "Buying behavior",
    options: ["Price-conscious", "Brand-loyal", "Frequent buyer", "First-time", "Promotion-led", "Researcher"],
  },
];

export function emptyCohort(): CohortFacets {
  return { age: [], region: [], household: [], behavior: [] };
}

export function cohortIsEmpty(f: CohortFacets, text = ""): boolean {
  return !text.trim() && FACET_GROUPS.every((g) => f[g.key].length === 0);
}

export interface Demographics {
  age: string;
  region: string;
  household: string;
  behavior: string;
}

/** Assign one persona a concrete demographic — from the selected facets if any,
 *  else from the full option list. Deterministic by id (no Math.random). */
export function personaDemographics(id: string, facets: CohortFacets): Demographics {
  const pick = (key: FacetKey, salt: string) => {
    const group = FACET_GROUPS.find((g) => g.key === key)!;
    const pool = facets[key].length ? facets[key] : group.options;
    return pool[fnv1a(id + salt) % pool.length];
  };
  return {
    age: pick("age", "|age"),
    region: pick("region", "|region"),
    household: pick("household", "|hh"),
    behavior: pick("behavior", "|beh"),
  };
}

/** Persona-prompt dimensions describing this individual's demographics + the
 *  reviewer's free-text audience note. Keys land in the run route's system prompt. */
export function cohortConditioning(demo: Demographics, text: string): Record<string, string> {
  const dims: Record<string, string> = {
    age_bracket: demo.age,
    region: demo.region,
    household: demo.household,
    buying_behavior: demo.behavior,
  };
  const t = text.trim();
  if (t) dims.audience_context = t.slice(0, 400);
  return dims;
}

/** Short human-readable summary of the current cohort for headers/labels. */
export function cohortSummary(f: CohortFacets, text = ""): string {
  const parts = FACET_GROUPS.flatMap((g) => (f[g.key].length ? [f[g.key].join("/")] : []));
  const base = parts.length ? parts.join(" · ") : "General population";
  return text.trim() ? `${base} — “${text.trim().slice(0, 60)}”` : base;
}
