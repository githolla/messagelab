// Lead Personalization — simulation engine.
//
// Each follow-up strategy is exposed to the lead's synthetic behavioral cohort.
// The agents behave as *recipients*, not copy reviewers: every cohort member
// lands on an action along the engagement funnel (ignore → … → meeting, with
// unsubscribe as a negative side-exit). We aggregate that into a per-strategy
// result and recommend the winner with a confidence level and a plain-English
// reason. Deterministic (fnv1a) so the recommendation is reproducible and free.

import { fnv1aFloat, clamp } from "./util";
import {
  type Lead,
  type Strategy,
  type CohortMember,
  type Traits,
  STRATEGIES,
  ACTIVE_STRATEGY_IDS,
  strategyById,
  buildLeadCohort,
  leadTraits,
  strategyFit,
  tierOf,
} from "./leads";

// Funnel of possible recipient actions, ordinal from cold to hot.
export const ACTIONS = [
  "ignore",
  "skim",
  "read",
  "click",
  "reply",
  "continue",
  "meeting",
] as const;
export type Action = (typeof ACTIONS)[number] | "unsubscribe";

export const ACTION_LABEL: Record<Action, string> = {
  ignore: "Ignored",
  skim: "Skimmed",
  read: "Read",
  click: "Clicked",
  reply: "Replied",
  continue: "Continued the conversation",
  meeting: "Meeting interest",
  unsubscribe: "Unsubscribed",
};

// Value of each outcome — what a follow-up is actually worth. Reply/meeting are
// the goals; unsubscribe is costly. Used to score and rank strategies.
const ACTION_VALUE: Record<Action, number> = {
  ignore: 0,
  skim: 6,
  read: 16,
  click: 34,
  reply: 62,
  continue: 82,
  meeting: 100,
  unsubscribe: -45,
};

// The eight factors the simulation reports (0–5 scale in the readout).
export const FACTORS = [
  { key: "relevance", label: "Relevance" },
  { key: "trust", label: "Trust" },
  { key: "personalization", label: "Personalization" },
  { key: "topicInterest", label: "Topic interest" },
  { key: "resourceInterest", label: "Resource interest" },
  { key: "conversationReadiness", label: "Conversation readiness" },
  { key: "salesResistance", label: "Sales resistance" },
  { key: "followupFatigue", label: "Follow-up fatigue" },
] as const;
export type FactorKey = (typeof FACTORS)[number]["key"];

export interface StrategyResult {
  strategyId: string;
  score: number; // 0–100 expected value across the cohort
  actionCounts: Record<Action, number>;
  positiveRate: number; // share who reply/continue/meeting
  factors: Record<FactorKey, number>; // mean 0–5
  n: number;
}

// Per-member response propensity for a strategy, in [0,1]. Combines base
// engagement, how well the strategy fits this member's signals, and the friction
// a pushy ask meets in a resistant / fatigued recipient.
function propensity(m: Traits, s: Strategy): number {
  const fit = strategyFit(m, s.id); // 0–~0.9
  const base = 0.42 * m.engagement + 0.16 * m.trustBase;
  const friction = s.pushiness * m.salesResistance * 0.55 + m.followupFatigue * 0.28;
  return clamp(base + fit - friction, 0, 1);
}

// Each strategy has its own action ladder (6 rungs, cold→hot) so the approaches
// produce genuinely different funnel shapes rather than all saturating at
// "meeting". An insight/conversation touch is built to earn a reply or start a
// dialogue; a resource earns clicks; a takeaway is a soft read; a meeting-led
// ask is convert-or-ignore — high ceiling but bimodal, so it only pays off for
// the hottest, lowest-resistance recipients.
const LADDER: Record<string, Action[]> = {
  insight: ["ignore", "skim", "read", "reply", "reply", "continue"],
  conversation: ["ignore", "skim", "read", "reply", "continue", "continue"],
  resource: ["ignore", "skim", "read", "click", "reply", "reply"],
  takeaway: ["ignore", "skim", "read", "read", "click", "click"],
  next_webinar: ["ignore", "skim", "read", "click", "click", "reply"],
  meeting: ["ignore", "ignore", "skim", "read", "reply", "meeting"],
};
const THRESHOLDS = [0.18, 0.32, 0.46, 0.6, 0.74]; // 5 cuts → 6 buckets

// Map a propensity (plus deterministic per-member noise) onto a funnel action.
function actionFor(p: number, m: Traits, s: Strategy, seed: string): Action {
  const noise = (fnv1aFloat(seed + "a") - 0.5) * 0.14;
  const x = clamp(p + noise, 0, 1);
  // A pushy ask to a resistant, fatigued recipient can trigger an unsubscribe.
  const unsubRisk = s.pushiness * m.salesResistance * m.followupFatigue;
  if (x < 0.16 && unsubRisk > 0.12 && fnv1aFloat(seed + "u") < unsubRisk) return "unsubscribe";
  let b = 0;
  while (b < THRESHOLDS.length && x >= THRESHOLDS[b]) b++;
  const ladder = LADDER[s.id] ?? LADDER.insight;
  return ladder[b];
}

// Factor readout (0–5) for a strategy given the cohort's mean traits.
function factorReadout(mean: Traits, s: Strategy): Record<FactorKey, number> {
  const to5 = (x: number) => clamp(Math.round(x * 5 * 10) / 10, 0, 5);
  const relevance = clamp(strategyFit(mean, s.id) + 0.15, 0, 1);
  const personalization = clamp(
    (s.id === "insight" || s.id === "conversation" ? 0.55 : s.id === "meeting" ? 0.35 : 0.3) +
      mean.conversationReadiness * 0.4,
    0,
    1
  );
  return {
    relevance: to5(relevance),
    trust: to5(mean.trustBase),
    personalization: to5(personalization),
    topicInterest: to5(mean.topicInterest),
    resourceInterest: to5(mean.resourceInterest),
    conversationReadiness: to5(mean.conversationReadiness),
    salesResistance: to5(mean.salesResistance),
    followupFatigue: to5(mean.followupFatigue),
  };
}

function meanTraits(cohort: CohortMember[]): Traits {
  const sum = (k: keyof Traits) => cohort.reduce((a, m) => a + m[k], 0) / Math.max(1, cohort.length);
  return {
    engagement: sum("engagement"),
    topicInterest: sum("topicInterest"),
    conversationReadiness: sum("conversationReadiness"),
    resourceInterest: sum("resourceInterest"),
    trustBase: sum("trustBase"),
    salesResistance: sum("salesResistance"),
    followupFatigue: sum("followupFatigue"),
  };
}

function emptyCounts(): Record<Action, number> {
  const c = {} as Record<Action, number>;
  for (const a of ACTIONS) c[a] = 0;
  c.unsubscribe = 0;
  return c;
}

/** Simulate one strategy against a lead's behavioral cohort. */
export function simulateStrategy(cohort: CohortMember[], strategyId: string): StrategyResult {
  const s = strategyById(strategyId);
  const counts = emptyCounts();
  let value = 0;
  let positive = 0;
  for (const m of cohort) {
    const p = propensity(m, s);
    const a = actionFor(p, m, s, m.id + s.id);
    counts[a] += 1;
    value += ACTION_VALUE[a];
    if (a === "reply" || a === "continue" || a === "meeting") positive += 1;
  }
  const n = cohort.length || 1;
  return {
    strategyId,
    score: clamp(Math.round((value / n) * 10) / 10, -45, 100),
    actionCounts: counts,
    positiveRate: positive / n,
    factors: factorReadout(meanTraits(cohort), s),
    n: cohort.length,
  };
}

export interface Recommendation {
  lead: Lead;
  results: StrategyResult[]; // sorted best-first, includes a synthetic "wait" entry
  winner: Strategy;
  runnerUp: Strategy;
  confidence: "High" | "Medium" | "Low";
  margin: number;
  explanation: string;
}

// Strategy families for the decision-margin confidence read: the soft
// engagement-first approaches are interchangeable enough that choosing among
// them is not what "confidence" should hinge on.
function family(id: string): "engage" | "resource" | "meeting" | "wait" {
  if (id === "resource") return "resource";
  if (id === "meeting") return "meeting";
  if (id === "wait") return "wait";
  return "engage";
}

// A "wait" floor: holding preserves the relationship. Its value rises when the
// audience is cold/fatigued, so it only wins for genuinely low-signal leads.
function waitScore(mean: Traits): number {
  return Math.round(clamp(18 + mean.followupFatigue * 30 - mean.engagement * 34, 4, 40) * 10) / 10;
}

/** Run every active strategy for a lead and pick the recommendation. */
export function recommend(lead: Lead, cohortSize = 16): Recommendation {
  const cohort = buildLeadCohort(lead, cohortSize);
  const mean = meanTraits(cohort);
  const active = ACTIVE_STRATEGY_IDS.map((id) => simulateStrategy(cohort, id));

  // Synthesize a "wait" result so it can win for low-signal leads.
  const ws = waitScore(mean);
  const waitResult: StrategyResult = {
    strategyId: "wait",
    score: ws,
    actionCounts: emptyCounts(),
    positiveRate: 0,
    factors: factorReadout(mean, strategyById("wait")),
    n: cohort.length,
  };

  const results = [...active, waitResult].sort((a, b) => b.score - a.score);
  const winner = strategyById(results[0].strategyId);

  // Confidence is about the *decision*, not the flavor: insight vs conversation
  // are the same soft family, so a tie between them is still a confident "go
  // soft". Measure the margin to the best strategy in a different family (soft /
  // resource / meeting / wait), and compare against that alternative.
  const winFam = family(winner.id);
  const outside = results.find((r) => family(r.strategyId) !== winFam);
  const runnerUp = strategyById((outside ?? results[1]).strategyId);
  const margin = Math.round((results[0].score - (outside ? outside.score : 0)) * 10) / 10;
  const confidence = margin >= 16 ? "High" : margin >= 7 ? "Medium" : "Low";

  return {
    lead,
    results,
    winner,
    runnerUp,
    confidence,
    margin,
    explanation: explain(lead, results, winner, runnerUp),
  };
}

// ---------------------------------------------------------------------------
// Plain-English explanation — the "See Why" text, grounded in the signals and
// the head-to-head margin.
// ---------------------------------------------------------------------------
function explain(lead: Lead, results: StrategyResult[], winner: Strategy, runnerUp: Strategy): string {
  const t = tierOf(lead);
  const topic = lead.topicSignal || "the webinar topic";
  const winRes = results.find((r) => r.strategyId === winner.id)!;

  if (winner.id === "wait") {
    return `${lead.name.split(" ")[0]} showed limited signal${
      lead.attended ? ` (${lead.pctAttended}% attended, no questions or survey)` : " (didn't attend live)"
    }. Similar low-signal profiles were more likely to disengage or unsubscribe from an individual touch than to respond, so holding preserves the relationship until there's a clearer signal.`;
  }

  const engagementPhrase =
    t.key === "high"
      ? `showed strong engagement with ${topic}`
      : t.key === "medium"
        ? `showed moderate interest in ${topic}`
        : `showed early interest in ${topic}`;

  const reasonByStrategy: Record<string, string> = {
    insight: `responded better to a topic-specific follow-up with a soft question than to an immediate meeting request`,
    conversation: `responded better to a personal, low-pressure question than to a direct ask`,
    resource: `were most likely to click and engage when sent a relevant resource matched to their interest`,
    takeaway: `engaged more with a useful recap than with a direct ask this early`,
    meeting: `were ready for a direct conversation given their engagement and existing relationship`,
    next_webinar: `re-engaged best with an invitation to keep learning while the topic was warm`,
  };
  const reason = reasonByStrategy[winner.id] ?? "responded best to this approach";
  const pos = Math.round(winRes.positiveRate * 100);

  return `This attendee ${engagementPhrase}. Similar profiles ${reason} — about ${pos}% of the simulated cohort replied, continued, or asked to meet. It out-scored "${runnerUp.name}" in the simulation.`;
}

/** Utility for the compact Lead-List / group views: the winner id per lead. */
export function recommendId(lead: Lead): string {
  return recommend(lead).winner.id;
}

export { STRATEGIES, strategyById, leadTraits };
