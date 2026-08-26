// The Deterministic Gate — types and the check registry.
//
// Thirty model-free checks (families D and F of the evaluator roster) that run
// against a proposal + its RFP with zero model calls, no API key, and no
// labelled data. A check either finds defects or it does not; `deficiency`
// findings on blocking checks stop a ship. Precision beats recall throughout:
// a critic that cries wolf gets switched off.

export type GateVerdict = "deficiency" | "weakness" | "pass" | "skipped";

export interface GateExample {
  section: string;
  quote: string;
}

export interface GateFinding {
  id: string; // D49…D68, F81…F90
  name: string;
  verdict: GateVerdict;
  blocking: boolean; // true only when verdict is deficiency AND the check blocks
  count: number; // defects found (0 on pass; -1 on skipped)
  summary: string; // the one-line scoresheet sentence
  examples: GateExample[];
}

export interface GatePerson {
  name: string;
  title: string;
}
export interface GateCaseStudy {
  name: string;
  subsector?: string;
  budgetBand?: string;
  fileSize?: string;
  region?: string;
  orgType?: string;
  toolset?: string[];
  channels?: string[];
}
export interface GateSource {
  name: string;
  year?: number;
  maxAgeYears?: number;
}
export interface GateAggregate {
  label: string;
  value: number;
  tolerancePct?: number; // default 10
}
export interface GateModelInput {
  name: string;
  source?: string;
  consequence?: string;
}
export interface GateFact {
  label: string;
  value: number;
}

/** Optional context registry. Checks that need a piece of it and don't get it
 * report `skipped` with the missing key named — never a silent pass. */
export interface GateContext {
  client?: GateCaseStudy; // the client's own profile, for proof-match
  people?: GatePerson[];
  referencesOffered?: string[];
  citedCaseStudies?: GateCaseStudy[];
  sources?: GateSource[];
  publishedAggregates?: GateAggregate[];
  modelInputs?: GateModelInput[];
  staleTerms?: string[]; // prior-client residue to hunt for
  rfpPreferences?: string[]; // stated reference preferences (else mined from RFP)
  requiredColumns?: string[]; // prescribed cost-table columns (else mined from RFP)
  clientFacts?: GateFact[]; // the client's own published numbers
  agencyNames?: string[]; // how the proposal refers to itself (default We/Our)
  clientNames?: string[]; // how the proposal refers to the client (You/Your + names)
}

export interface CheckMeta {
  id: string;
  name: string;
  brief: string;
  blocking: boolean; // does a deficiency here block shipping
  needs?: (keyof GateContext)[]; // context required to run at all
}

export const GATE_CHECKS: CheckMeta[] = [
  { id: "D49", name: "Compliance gap detector", brief: "Every shall/must/required in the RFP mapped to the text that answers it.", blocking: true },
  { id: "D50", name: "Prescribed-format checker", brief: "Mandated tables, column structures, and named sections.", blocking: true },
  { id: "D51", name: "Bare-feature detector", brief: "Capability claims lacking a benefit clause or proof anchor.", blocking: false },
  { id: "D52", name: "Unsourced-claim detector", brief: "Quantified sentences with no source marker.", blocking: false },
  { id: "D53", name: "Advantage-statement detector", brief: "'This can help you…' with no stated need behind it.", blocking: false },
  { id: "D54", name: "Rhetorical-question counter", brief: "Density and placement against the one-per-section rule.", blocking: false },
  { id: "D55", name: "Customer-as-subject checker", brief: "Whether benefit sentences lead with the client or the agency.", blocking: false },
  { id: "D56", name: "Cross-section contradiction finder", brief: "A numeric anchor carrying different values in different sections.", blocking: true },
  { id: "D57", name: "Recycled-content detector", brief: "Stale terms and near-duplicate passages.", blocking: false },
  { id: "D58", name: "Keyword-density checker", brief: "Client-vocabulary mirroring vs stuffing.", blocking: false },
  { id: "D59", name: "Hedging scorer", brief: "'Strive to', 'seek to', 'may' where 'will' is available.", blocking: false },
  { id: "D60", name: "Weasel-word detector", brief: "Superlatives standing in for proof.", blocking: false },
  { id: "D61", name: "Placeholder detector", brief: "$XX,XXX, [brackets], TBD, lorem. Nothing ships with one open.", blocking: true },
  { id: "D62", name: "Number consistency checker", brief: "The same money figure stated differently under one label.", blocking: true },
  { id: "D63", name: "Arithmetic verifier", brief: "Every additive table column recomputed against its total.", blocking: true },
  { id: "D64", name: "Date and calendar validator", brief: "Impossible dates and out-of-order schedule rows.", blocking: true },
  { id: "D65", name: "Named-person validator", brief: "Every named individual carries the correct title nearby.", blocking: true, needs: ["people"] },
  { id: "D66", name: "Terminology mirror", brief: "The client's frequent words present in the response.", blocking: false },
  { id: "D67", name: "Reading-effort scorer", brief: "Sentence length, paragraph weight, tables doing the synthesis.", blocking: false },
  { id: "D68", name: "Deliverable accessibility checker", brief: "Contrast, alt text, tag order in the submitted PDF.", blocking: true }, // always skipped in-app — needs the PDF artifact itself
  { id: "F81", name: "Benchmark provenance verifier", brief: "Cited benchmarks traced to the source registry.", blocking: false },
  { id: "F82", name: "Benchmark currency checker", brief: "Whether each cited figure is the latest release.", blocking: false, needs: ["sources"] },
  { id: "F83", name: "Model reconciliation checker", brief: "The proposal's model vs published aggregates.", blocking: false, needs: ["publishedAggregates"] },
  { id: "F84", name: "Assumption completeness auditor", brief: "Every model input has a source and a consequence-if-wrong.", blocking: false, needs: ["modelInputs"] },
  { id: "F85", name: "Proof-match scorer", brief: "Case-study relevance by dimension, not impressiveness.", blocking: false, needs: ["client", "citedCaseStudies"] },
  { id: "F86", name: "Reference relevance scorer", brief: "References against the preferences the RFP actually stated.", blocking: true, needs: ["referencesOffered"] },
  { id: "F87", name: "Ghost-validity checker", brief: "Implicit competitive claims that need support.", blocking: false },
  { id: "F88", name: "Public-record cross-checker", brief: "Contradictions against the client's own published numbers.", blocking: false, needs: ["clientFacts"] },
  { id: "F89", name: "Confidence-calibration auditor", brief: "Projections stated as ranges with a named central case.", blocking: false },
  { id: "F90", name: "Denominator auditor", brief: "Every percentage carries its base.", blocking: false },
];

export function checkMeta(id: string): CheckMeta {
  return GATE_CHECKS.find((c) => c.id === id)!;
}

export interface GateTally {
  deficiencies: number;
  weaknesses: number;
  passes: number;
  skipped: number;
  blocking: number;
}

export interface GateRun {
  findings: GateFinding[];
  tally: GateTally;
}

export function tallyFindings(findings: GateFinding[]): GateTally {
  return {
    deficiencies: findings.filter((f) => f.verdict === "deficiency").length,
    weaknesses: findings.filter((f) => f.verdict === "weakness").length,
    passes: findings.filter((f) => f.verdict === "pass").length,
    skipped: findings.filter((f) => f.verdict === "skipped").length,
    blocking: findings.filter((f) => f.blocking).length,
  };
}

const ORDER: Record<GateVerdict, number> = { deficiency: 0, weakness: 1, pass: 2, skipped: 3 };
export function sortFindings(findings: GateFinding[]): GateFinding[] {
  return [...findings].sort((a, b) =>
    ORDER[a.verdict] - ORDER[b.verdict] || Number(b.blocking) - Number(a.blocking) || a.id.localeCompare(b.id));
}
