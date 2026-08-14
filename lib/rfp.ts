// RFP Simulator — sales side. You're responding to an RFP; before you submit,
// a simulated buying committee scores your proposal, tells you your win
// likelihood, where you'd lose points, and what to fix. Same persona-panel idea
// as the A/B tool, aimed at a B2B evaluation committee.

export type CriterionKey = "fit" | "differentiation" | "proof" | "value" | "risk" | "clarity";

export interface Criterion {
  key: CriterionKey;
  label: string;
  blurb: string;
}

export const CRITERIA: Criterion[] = [
  { key: "fit", label: "Requirements fit", blurb: "Does it address the RFP's stated needs, point by point?" },
  { key: "differentiation", label: "Differentiation", blurb: "Why you over the other bidders?" },
  { key: "proof", label: "Proof & references", blurb: "Evidence it works — results, references, metrics." },
  { key: "value", label: "Pricing & value", blurb: "Clear cost, ROI, and a business case." },
  { key: "risk", label: "Risk & compliance", blurb: "Security, compliance, delivery risk, SLAs." },
  { key: "clarity", label: "Clarity & responsiveness", blurb: "Structured, complete, easy to evaluate." },
];

export const CRITERION_LABEL: Record<CriterionKey, string> = Object.fromEntries(
  CRITERIA.map((c) => [c.key, c.label]),
) as Record<CriterionKey, string>;

export interface RfpEvaluator {
  id: string;
  role: string;
  focus: string;
  weight: number; // relative influence on the committee decision
  cares: CriterionKey[]; // the criteria this role weights most
  instruction: string; // what this evaluator judges (used in the AI prompt)
  builtin?: boolean;
}

export const DEFAULT_COMMITTEE: RfpEvaluator[] = [
  {
    id: "economic",
    role: "Economic Buyer",
    focus: "ROI & business case",
    weight: 0.28,
    cares: ["value", "fit", "differentiation"],
    instruction: "Owns the budget. Judges whether the proposal makes a clear, credible business case — ROI, total cost, and payback — and whether the outcome is worth the spend versus other bidders.",
    builtin: true,
  },
  {
    id: "technical",
    role: "Technical Evaluator",
    focus: "Requirements & architecture",
    weight: 0.24,
    cares: ["fit", "proof", "risk"],
    instruction: "Scores the proposal against the RFP's technical requirements point by point. Rewards specific, verifiable answers and penalizes vague claims, gaps, or unproven capabilities.",
    builtin: true,
  },
  {
    id: "procurement",
    role: "Procurement",
    focus: "Pricing, terms & compliance",
    weight: 0.18,
    cares: ["value", "risk", "clarity"],
    instruction: "Checks pricing clarity, contract terms, and whether the response is complete and compliant with the RFP's format and mandatory requirements. Penalizes missing sections and unclear pricing.",
    builtin: true,
  },
  {
    id: "champion",
    role: "Champion / End User",
    focus: "Fit, adoption & usability",
    weight: 0.16,
    cares: ["fit", "differentiation", "clarity"],
    instruction: "The person who has to live with the choice. Judges day-to-day fit, ease of adoption, and whether the vendor clearly understands their world — not just the spec.",
    builtin: true,
  },
  {
    id: "security",
    role: "Security & Legal",
    focus: "Data, compliance & risk",
    weight: 0.14,
    cares: ["risk", "proof", "clarity"],
    instruction: "Screens for security, data-handling, compliance (SOC 2, ISO, GDPR/HIPAA where relevant), SLAs, and delivery risk. A gap here can veto an otherwise strong bid.",
    builtin: true,
  },
];

export function newEvaluator(n: number): RfpEvaluator {
  return {
    id: `eval-custom-${n}`,
    role: "New evaluator",
    focus: "What they weigh",
    weight: 0.15,
    cares: ["fit"],
    instruction: "Describe what this stakeholder cares about when scoring a proposal.",
  };
}

export interface RfpInput {
  offering: string; // what you're selling
  dealSize: string; // e.g. "$120k / year"
  competitor: string; // optional named rival
  rfp: string; // the RFP requirements (optional but improves fit scoring)
  proposal: string; // your response (required)
}

export interface CriterionScore {
  key: CriterionKey;
  label: string;
  score: number; // 0-100
  note: string;
}
export interface EvaluatorRead {
  id: string;
  role: string;
  score: number; // 0-100
  verdict: string;
  concern: string;
  wouldWin: string;
}
export interface Gap {
  text: string;
  severity: "high" | "medium" | "low";
}
export interface RfpAction {
  text: string;
  priority: "high" | "medium" | "low";
}

export type RfpVerdict = "strong" | "competitive" | "longshot" | "rework";

export const VERDICT_LABEL: Record<RfpVerdict, string> = {
  strong: "Strong bid",
  competitive: "Competitive",
  longshot: "Longshot",
  rework: "Rework before submitting",
};

export interface RfpResult {
  winScore: number; // 0-100 win likelihood
  verdict: RfpVerdict;
  headline: string;
  criteria: CriterionScore[];
  evaluators: EvaluatorRead[];
  gaps: Gap[];
  actions: RfpAction[];
}

export const SAMPLE_RFP_INPUT: RfpInput = {
  offering: "Cloud data platform + implementation services",
  dealSize: "$180k / year",
  competitor: "Snowflake",
  rfp: `Request for Proposal — Enterprise Analytics Platform

Background: We are a mid-market healthcare payer seeking a modern analytics platform to replace a legacy on-prem warehouse.

Mandatory requirements:
1. Cloud-native platform with role-based access control and column-level security.
2. HIPAA compliance and SOC 2 Type II; data encryption at rest and in transit.
3. Ingestion from 12+ source systems (claims, eligibility, EHR) with < 4h latency.
4. Self-serve reporting for 200+ business users; row-level security by department.
5. 99.9% uptime SLA and a named implementation team.
6. Total cost of ownership over 3 years, including implementation and support.
7. Three references from comparable healthcare organizations.
Evaluation weighting: technical fit 35%, cost 25%, security/compliance 20%, references 20%.`,
  proposal: `Executive summary

Thank you for the opportunity. Our cloud-native analytics platform is purpose-built for healthcare payers and directly addresses each of your seven mandatory requirements.

Requirements response
1. Role-based and column-level security are native, with row-level security by department for your 200+ business users.
2. We are HIPAA compliant and SOC 2 Type II certified; all data is encrypted at rest (AES-256) and in transit (TLS 1.2+).
3. Pre-built connectors ingest claims, eligibility, and EHR data from 15 source systems with sub-2-hour latency.
4. Self-serve dashboards ship with a healthcare starter model so business users are productive in week one.
5. We commit to a 99.9% uptime SLA and assign a named, healthcare-experienced implementation team.

Proof
Regional Health Plan cut reporting time 60% and onboarded 240 users in 8 weeks. We can provide three healthcare payer references on request.

Pricing & value
$180k/year all-in, including implementation and support. Estimated 3-year TCO is 22% below your current on-prem spend, with payback in 14 months.

Next steps
We'd welcome a technical deep-dive and a reference call. We can begin implementation within 30 days of award.`,
};
