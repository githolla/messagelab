// Deterministic RFP scoring — heuristic, no API key, no Math.random. Scores a
// proposal against the six criteria, rolls the committee up into a win
// likelihood, and derives gaps + prioritized fixes. The live /api/rfp-eval route
// upgrades this with a model when a key is present.

import type {
  RfpEvaluator,
  RfpInput,
  RfpResult,
  CriterionKey,
  CriterionScore,
  EvaluatorRead,
  Gap,
  RfpAction,
  RfpVerdict,
} from "./rfp";
import { CRITERIA, CRITERION_LABEL } from "./rfp";

const clampScore = (n: number) => Math.max(14, Math.min(96, Math.round(n)));

function hits(hay: string, needles: string[]): number {
  const l = hay.toLowerCase();
  return needles.reduce((t, n) => t + (l.includes(n) ? 1 : 0), 0);
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "our", "will", "must", "are", "you",
  "have", "has", "all", "any", "including", "include", "requirements", "requirement", "system",
  "systems", "provide", "please", "proposal", "vendor", "response", "over", "years", "year",
]);
// Salient requirement terms from the RFP (long words, minus boilerplate).
function salientTerms(rfp: string): string[] {
  const freq = new Map<string, number>();
  for (const w of rfp.toLowerCase().match(/\b[a-z][a-z0-9-]{4,}\b/g) || []) {
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map((e) => e[0]);
}

function scoreCriteria(input: RfpInput): Record<CriterionKey, number> {
  const proposal = input.proposal || "";
  const p = proposal.toLowerCase();
  const wc = (proposal.match(/\b[\w'-]+\b/g) || []).length;

  // Requirements fit — coverage of RFP terms if an RFP is provided, else cues.
  let fit: number;
  if (input.rfp.trim()) {
    const terms = salientTerms(input.rfp);
    const covered = terms.filter((t) => p.includes(t)).length;
    fit = terms.length ? Math.round((covered / terms.length) * 95) + 8 : 55;
  } else {
    fit = 44 + hits(p, ["your ", "you need", "requirement", "as requested", "in response to", "outlined", "specified", "scope", "point by point"]) * 8;
  }

  const differentiation =
    30 +
    hits(p, ["unlike", "unique", "only ", "differentiat", "advantage", "proprietary", "patented", "best-in-class", " vs ", "versus", "compared to", "purpose-built"]) * 11 +
    (input.competitor && p.includes(input.competitor.toLowerCase().split(/\s+/)[0]) ? 10 : 0);

  const proofCount =
    (proposal.match(/\b\d+%|\$\s?\d|\b\d+x\b|\b\d{2,}\b/g) || []).length +
    hits(p, ["case study", "reference", "customer", "proven", "results", "testimonial", "award", "cut ", "reduced", "increased", "onboarded", "payback"]);
  const proof = 26 + proofCount * 6;

  const value = 30 + hits(p, ["$", "price", "pricing", "cost", "per year", "per month", "annual", "roi", "payback", "tco", "total cost", "save", "savings", "budget", "investment", "all-in"]) * 8;

  const risk = 28 + hits(p, ["soc 2", "soc2", "iso 27", "gdpr", "hipaa", "sla", "uptime", "99.9", "encrypt", "compliance", "compliant", "implementation team", "implementation plan", "timeline", "onboarding", "support", "migration", "at rest", "in transit"]) * 8;

  const paras = proposal.split(/\n\s*\n/).filter((x) => x.trim()).length;
  const hasSummary = /executive summary|overview|summary/i.test(proposal);
  const hasNext = /next step|to proceed|kick.?off|get started|begin implementation|schedule a|deep-dive|reference call/i.test(proposal);
  const hasBullets = /(^|\n)\s*(?:[-•*]|\d+\.)/.test(proposal);
  const lenGood = wc >= 200 && wc <= 1600;
  const clarity =
    38 + Math.min(paras, 6) * 3 + (hasSummary ? 12 : 0) + (hasNext ? 12 : 0) + (hasBullets ? 8 : 0) + (lenGood ? 10 : 0) - (wc > 2400 ? 16 : 0) - (wc < 120 ? 22 : 0);

  return {
    fit: clampScore(fit),
    differentiation: clampScore(differentiation),
    proof: clampScore(proof),
    value: clampScore(value),
    risk: clampScore(risk),
    clarity: clampScore(clarity),
  };
}

const NOTE_GOOD: Record<CriterionKey, string> = {
  fit: "Addresses the stated requirements directly.",
  differentiation: "Makes a clear case for why you over the field.",
  proof: "Backs claims with results and references.",
  value: "Pricing and the business case are explicit.",
  risk: "Security, compliance, and delivery are covered.",
  clarity: "Well-structured and easy to evaluate.",
};
const NOTE_BAD: Record<CriterionKey, string> = {
  fit: "Doesn't clearly map to the RFP's specific requirements.",
  differentiation: "Reads interchangeable with any other bidder.",
  proof: "Claims aren't backed by evidence or references.",
  value: "Pricing / ROI is vague or missing.",
  risk: "Security, compliance, or delivery risk is unaddressed.",
  clarity: "Hard to evaluate — thin, unstructured, or missing sections.",
};
const GAP_TEXT: Record<CriterionKey, string> = {
  fit: "Requirements aren't answered point-by-point — evaluators can't check the boxes.",
  differentiation: "No clear reason to pick you over the other bidders.",
  proof: "No metrics, results, or references to substantiate the claims.",
  value: "Missing a clear price, ROI, or total-cost story.",
  risk: "Security / compliance / SLA gaps that can veto the bid.",
  clarity: "Structure or completeness makes it hard to score.",
};
const ACTION_TEXT: Record<CriterionKey, string> = {
  fit: "Add a requirement-by-requirement compliance matrix mapping each RFP item to your answer.",
  differentiation: "State 2–3 concrete reasons you win versus the likely alternative, with specifics.",
  proof: "Add named references and 2–3 quantified outcomes (%, $, time) from comparable customers.",
  value: "Include all-in pricing and a 3-year TCO / ROI with payback period.",
  risk: "Spell out certifications (SOC 2, ISO, HIPAA), the SLA, and the implementation plan + team.",
  clarity: "Add an executive summary, section headers per requirement, and a clear next step.",
};

function evaluatorScore(ev: RfpEvaluator, crit: Record<CriterionKey, number>): number {
  const cared = ev.cares.length ? ev.cares : (Object.keys(crit) as CriterionKey[]);
  const caredAvg = cared.reduce((t, k) => t + crit[k], 0) / cared.length;
  const allAvg = (Object.values(crit).reduce((a, b) => a + b, 0)) / 6;
  return Math.round(caredAvg * 0.72 + allAvg * 0.28);
}

function verdictFrom(win: number): RfpVerdict {
  if (win >= 72) return "strong";
  if (win >= 58) return "competitive";
  if (win >= 42) return "longshot";
  return "rework";
}

export function evaluateRfp(committee: RfpEvaluator[], input: RfpInput): RfpResult {
  const crit = scoreCriteria(input);
  const criteria: CriterionScore[] = CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    score: crit[c.key],
    note: crit[c.key] >= 62 ? NOTE_GOOD[c.key] : NOTE_BAD[c.key],
  }));

  const totalWeight = committee.reduce((t, e) => t + (e.weight || 0), 0) || 1;
  const evaluators: EvaluatorRead[] = committee.map((ev) => {
    const score = evaluatorScore(ev, crit);
    const cared = (ev.cares.length ? ev.cares : (Object.keys(crit) as CriterionKey[]));
    const weakest = [...cared].sort((a, b) => crit[a] - crit[b])[0];
    return {
      id: ev.id,
      role: ev.role,
      score,
      verdict: score >= 70 ? "Would advance it" : score >= 55 ? "On the fence" : "Would rank it below rivals",
      concern: `${CRITERION_LABEL[weakest]}: ${NOTE_BAD[weakest]}`,
      wouldWin: ACTION_TEXT[weakest],
    };
  });

  const winScore = clampScore(
    committee.reduce((t, ev, i) => t + (ev.weight || 0) * evaluators[i].score, 0) / totalWeight,
  );
  const verdict = verdictFrom(winScore);

  const sevOf = (s: number): Gap["severity"] => (s < 45 ? "high" : s < 62 ? "medium" : "low");
  const gaps: Gap[] = criteria
    .filter((c) => c.score < 62)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((c) => ({ text: GAP_TEXT[c.key], severity: sevOf(c.score) }));

  const actions: RfpAction[] = criteria
    .filter((c) => c.score < 68)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((c) => ({ text: ACTION_TEXT[c.key], priority: c.score < 45 ? "high" : c.score < 62 ? "medium" : "low" }));

  const strongest = [...criteria].sort((a, b) => b.score - a.score)[0];
  const weakest = [...criteria].sort((a, b) => a.score - b.score)[0];
  const headline =
    verdict === "strong"
      ? `Strong bid — leads on ${strongest.label.toLowerCase()}. Tighten ${weakest.label.toLowerCase()} to lock it.`
      : verdict === "competitive"
        ? `Competitive, but ${weakest.label.toLowerCase()} is where you'd lose points — fix it before submitting.`
        : verdict === "longshot"
          ? `A longshot as written — ${weakest.label.toLowerCase()} and the gaps below need work to be credible.`
          : `Not ready to submit — the proposal has gaps evaluators would flag on ${weakest.label.toLowerCase()}.`;

  return { winScore, verdict, headline, criteria, evaluators, gaps, actions };
}
