// Lead Personalization — domain layer.
//
// Diane's existing workflow is Webinar → Lead List → Select Lead → Review Email
// → Approve. This module models the webinar behavioral signals we already have,
// turns them into a lead profile, and derives the synthetic *behavioral cohort*
// the simulation reacts as (we never simulate the named individual — only
// prospects with similar characteristics). It also defines the catalog of
// genuinely-different follow-up strategies and a cheap heuristic "next step" for
// the Lead List queue. Everything is deterministic (fnv1a, no Math.random) so
// the demo is reproducible and needs no API key.

import { fnv1a, fnv1aFloat, clamp } from "./util";

export type Seniority = "C-suite" | "VP" | "Director" | "Manager" | "Individual";
export type Relationship = "none" | "opportunity" | "client";

export interface Webinar {
  id: string;
  title: string;
  topic: string; // short topic label used in copy, e.g. "donor retention"
  date: string;
  attendees: number;
}

export interface Lead {
  id: string;
  name: string;
  title: string;
  seniority: Seniority;
  company: string;
  targetAccount: boolean;
  relationship: Relationship;
  // Webinar behavior
  attended: boolean;
  pctAttended: number; // 0–100
  stayedToEnd: boolean;
  questionsAsked: number;
  surveyCompleted: boolean;
  surveyInterest?: string; // topic they flagged in the survey
  resourcesDownloaded: number;
  priorWebinars: number; // previous webinar engagement count
  topicSignal: string; // sub-topic they engaged with most
}

export interface Tier {
  key: "high" | "medium" | "low";
  label: string;
}

// ---------------------------------------------------------------------------
// Engagement score — a single 0–100 read of how strong this lead's signal is.
// ---------------------------------------------------------------------------
export function engagementScore(l: Lead): number {
  if (!l.attended) return clamp(6 + l.priorWebinars * 4 + l.resourcesDownloaded * 3, 0, 22);
  let s = 0;
  s += (l.pctAttended / 100) * 34; // showed up and stayed
  s += l.stayedToEnd ? 12 : 0;
  s += Math.min(l.questionsAsked, 3) * 6; // asked questions (max 18)
  s += l.surveyCompleted ? 9 : 0;
  s += Math.min(l.resourcesDownloaded, 3) * 5; // grabbed resources (max 15)
  s += Math.min(l.priorWebinars, 3) * 3; // repeat attendee (max 9)
  s += l.relationship === "opportunity" ? 3 : 0;
  return clamp(Math.round(s), 0, 100);
}

export function tierOf(l: Lead): Tier {
  const s = engagementScore(l);
  if (s >= 62) return { key: "high", label: "High" };
  if (s >= 32) return { key: "medium", label: "Medium" };
  return { key: "low", label: "Low" };
}

// ---------------------------------------------------------------------------
// Follow-up strategy catalog — genuinely different approaches, not three
// variations of the same email.
// ---------------------------------------------------------------------------
export interface Strategy {
  id: string;
  title: string; // recommendation-card title, e.g. "Continue their webinar topic"
  name: string; // short internal name, e.g. "Insight-led"
  nextStep: string; // Lead-List "Recommended Next Step" label
  blurb: string; // one line describing the approach
  pushiness: number; // 0–1, how much of a direct ask it makes
}

export const STRATEGIES: Strategy[] = [
  {
    id: "insight",
    title: "Continue their webinar topic",
    name: "Insight-led",
    nextStep: "Personal follow-up",
    blurb: "Pick up a specific point they engaged with and add one useful insight.",
    pushiness: 0.25,
  },
  {
    id: "conversation",
    title: "Open a conversation",
    name: "Conversation-led",
    nextStep: "Start conversation",
    blurb: "A personal observation and one soft question to invite a reply.",
    pushiness: 0.35,
  },
  {
    id: "resource",
    title: "Send the most relevant resource",
    name: "Resource-led",
    nextStep: "Send relevant resource",
    blurb: "Share the AGP resource that matches their demonstrated interest.",
    pushiness: 0.3,
  },
  {
    id: "takeaway",
    title: "Send a webinar takeaway",
    name: "Takeaway-led",
    nextStep: "Webinar takeaway",
    blurb: "Recap the single most valuable takeaway for people like them.",
    pushiness: 0.2,
  },
  {
    id: "meeting",
    title: "Offer a meeting",
    name: "Meeting-led",
    nextStep: "Offer a meeting",
    blurb: "A direct, low-friction invitation to talk it through.",
    pushiness: 0.9,
  },
  {
    id: "nurture",
    title: "Light nurture",
    name: "Nurture",
    nextStep: "Light nurture",
    blurb: "A low-pressure touch that keeps AGP present without asking for anything.",
    pushiness: 0.1,
  },
  {
    id: "next_webinar",
    title: "Invite to the next webinar",
    name: "Next-webinar",
    nextStep: "Invite to next webinar",
    blurb: "Point them to the next relevant session while the topic is warm.",
    pushiness: 0.2,
  },
  {
    id: "wait",
    title: "Wait — no immediate follow-up",
    name: "Wait",
    nextStep: "Wait",
    blurb: "Not enough signal yet to justify an individual touch. Hold and watch.",
    pushiness: 0,
  },
];

export function strategyById(id: string): Strategy {
  return STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[0];
}

// Strategies that get simulated head-to-head (Phase 1 shows a focused set; "wait"
// is handled as a floor in the recommendation, not a simulated cohort target).
export const ACTIVE_STRATEGY_IDS = [
  "insight",
  "conversation",
  "resource",
  "takeaway",
  "meeting",
  "next_webinar",
];

// ---------------------------------------------------------------------------
// Latent traits — the lead's profile expressed as 0–1 propensities the cohort
// and simulation are built from.
// ---------------------------------------------------------------------------
export interface Traits {
  engagement: number;
  topicInterest: number;
  conversationReadiness: number;
  resourceInterest: number;
  trustBase: number;
  salesResistance: number;
  followupFatigue: number;
}

export function leadTraits(l: Lead): Traits {
  const eng = engagementScore(l) / 100;
  const seniorityResist =
    l.seniority === "C-suite" ? 0.5 : l.seniority === "VP" ? 0.4 : l.seniority === "Director" ? 0.3 : 0.22;
  const relTrust = l.relationship === "client" ? 0.85 : l.relationship === "opportunity" ? 0.62 : 0.4;
  const relResist = l.relationship === "client" ? -0.15 : l.relationship === "opportunity" ? -0.08 : 0.08;
  const coldTarget = l.targetAccount && l.relationship === "none" ? 0.08 : 0;
  return {
    engagement: eng,
    topicInterest: clamp(
      0.35 + (l.surveyCompleted ? 0.15 : 0) + Math.min(l.questionsAsked, 3) * 0.08 + (l.stayedToEnd ? 0.12 : 0),
      0,
      1
    ),
    conversationReadiness: clamp(
      0.2 + Math.min(l.questionsAsked, 3) * 0.13 + (l.stayedToEnd ? 0.15 : 0) + (l.pctAttended / 100) * 0.2,
      0,
      1
    ),
    resourceInterest: clamp(0.3 + Math.min(l.resourcesDownloaded, 3) * 0.17 + (l.surveyCompleted ? 0.08 : 0), 0, 1),
    trustBase: clamp(relTrust + Math.min(l.priorWebinars, 3) * 0.05, 0, 1),
    salesResistance: clamp(seniorityResist + relResist + coldTarget, 0.05, 0.95),
    followupFatigue: clamp(0.12 + Math.min(l.priorWebinars, 4) * 0.11, 0, 0.8),
  };
}

// ---------------------------------------------------------------------------
// Behavioral cohort — synthetic prospects that resemble this lead. We jitter the
// lead's latent traits so the cohort spans the realistic neighborhood around the
// individual rather than cloning them. Deterministic by lead id + index.
// ---------------------------------------------------------------------------
export interface CohortMember extends Traits {
  id: string;
}

function jitter(seed: string, spread: number): number {
  // symmetric noise in [-spread, +spread]
  return (fnv1aFloat(seed) - 0.5) * 2 * spread;
}

export function buildLeadCohort(lead: Lead, size = 16): CohortMember[] {
  const base = leadTraits(lead);
  const out: CohortMember[] = [];
  for (let i = 0; i < size; i++) {
    const s = `${lead.id}#${i}`;
    out.push({
      id: s,
      engagement: clamp(base.engagement + jitter(s + "e", 0.18), 0, 1),
      topicInterest: clamp(base.topicInterest + jitter(s + "t", 0.18), 0, 1),
      conversationReadiness: clamp(base.conversationReadiness + jitter(s + "c", 0.18), 0, 1),
      resourceInterest: clamp(base.resourceInterest + jitter(s + "r", 0.18), 0, 1),
      trustBase: clamp(base.trustBase + jitter(s + "u", 0.15), 0, 1),
      salesResistance: clamp(base.salesResistance + jitter(s + "s", 0.16), 0.05, 0.98),
      followupFatigue: clamp(base.followupFatigue + jitter(s + "f", 0.14), 0, 0.9),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Heuristic "Recommended Next Step" for the Lead List queue. This is the cheap,
// at-a-glance recommendation; the full simulation refines it once a lead is
// opened. Kept consistent with the simulation's strategy-fit ordering.
// ---------------------------------------------------------------------------
export function strategyFit(t: Traits, strategyId: string): number {
  switch (strategyId) {
    case "insight":
      return 0.3 * t.conversationReadiness + 0.3 * t.topicInterest + 0.2 * t.engagement;
    case "conversation":
      return 0.5 * t.conversationReadiness + 0.2 * t.trustBase + 0.1 * t.engagement;
    case "resource":
      return 0.55 * t.resourceInterest + 0.2 * t.topicInterest;
    case "takeaway":
      return 0.3 * t.engagement + 0.25 * t.topicInterest + 0.1;
    case "meeting":
      return 0.4 * t.conversationReadiness * t.engagement + 0.35 * t.trustBase - 0.2 * t.salesResistance;
    case "next_webinar":
      return 0.35 * t.topicInterest + 0.2 * t.engagement + 0.1;
    case "nurture":
      return 0.45 * (1 - t.engagement) + 0.1;
    default:
      return 0;
  }
}

export function recommendedNextStep(lead: Lead): Strategy {
  const t = leadTraits(lead);
  const tier = tierOf(lead);
  if (tier.key === "low" && t.engagement < 0.28) return strategyById("wait");
  const ranked = ACTIVE_STRATEGY_IDS.map((id) => ({ id, fit: strategyFit(t, id) })).sort((a, b) => b.fit - a.fit);
  // Medium-low leads with real but soft signal lean to nurture over an active ask.
  if (tier.key === "low") return strategyById("nurture");
  return strategyById(ranked[0].id);
}

// ---------------------------------------------------------------------------
// Sample webinar + lead list — deterministic demo data (no API). A realistic AGP
// nonprofit-fundraising webinar audience with a spread of behaviors.
// ---------------------------------------------------------------------------
export const SAMPLE_WEBINAR: Webinar = {
  id: "wb-donor-retention",
  title: "Donor Retention in 2026: Keeping the Givers You Have",
  topic: "donor retention",
  date: "2026-08-06",
  attendees: 78,
};

export const SAMPLE_LEADS: Lead[] = [
  {
    id: "l-jane-smith",
    name: "Jane Smith",
    title: "VP of Development",
    seniority: "VP",
    company: "Riverside Children's Foundation",
    targetAccount: true,
    relationship: "opportunity",
    attended: true,
    pctAttended: 96,
    stayedToEnd: true,
    questionsAsked: 3,
    surveyCompleted: true,
    surveyInterest: "second-gift conversion",
    resourcesDownloaded: 2,
    priorWebinars: 2,
    topicSignal: "lapsed-donor reactivation",
  },
  {
    id: "l-bob-jones",
    name: "Bob Jones",
    title: "Director of Annual Giving",
    seniority: "Director",
    company: "Lakeside Health Alliance",
    targetAccount: true,
    relationship: "none",
    attended: true,
    pctAttended: 88,
    stayedToEnd: true,
    questionsAsked: 4,
    surveyCompleted: true,
    surveyInterest: "mid-level donor journeys",
    resourcesDownloaded: 1,
    priorWebinars: 1,
    topicSignal: "mid-level giving",
  },
  {
    id: "l-sarah-lee",
    name: "Sarah Lee",
    title: "Annual Fund Manager",
    seniority: "Manager",
    company: "Coastal Conservation Trust",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 74,
    stayedToEnd: false,
    questionsAsked: 1,
    surveyCompleted: true,
    surveyInterest: "email segmentation",
    resourcesDownloaded: 3,
    priorWebinars: 0,
    topicSignal: "retention email cadence",
  },
  {
    id: "l-mike-hall",
    name: "Mike Hall",
    title: "Development Coordinator",
    seniority: "Individual",
    company: "Summit Youth Services",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 61,
    stayedToEnd: false,
    questionsAsked: 0,
    surveyCompleted: false,
    resourcesDownloaded: 1,
    priorWebinars: 1,
    topicSignal: "general retention",
  },
  {
    id: "l-amy-cole",
    name: "Amy Cole",
    title: "Grants Associate",
    seniority: "Individual",
    company: "Harbor Arts Council",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 28,
    stayedToEnd: false,
    questionsAsked: 0,
    surveyCompleted: false,
    resourcesDownloaded: 0,
    priorWebinars: 0,
    topicSignal: "general retention",
  },
  {
    id: "l-david-park",
    name: "David Park",
    title: "Chief Advancement Officer",
    seniority: "C-suite",
    company: "Metropolitan Education Fund",
    targetAccount: true,
    relationship: "client",
    attended: true,
    pctAttended: 100,
    stayedToEnd: true,
    questionsAsked: 2,
    surveyCompleted: true,
    surveyInterest: "board-level retention reporting",
    resourcesDownloaded: 2,
    priorWebinars: 3,
    topicSignal: "retention benchmarking",
  },
  {
    id: "l-priya-nair",
    name: "Priya Nair",
    title: "Director of Donor Relations",
    seniority: "Director",
    company: "Open Door Shelter Network",
    targetAccount: true,
    relationship: "opportunity",
    attended: true,
    pctAttended: 92,
    stayedToEnd: true,
    questionsAsked: 1,
    surveyCompleted: false,
    resourcesDownloaded: 2,
    priorWebinars: 1,
    topicSignal: "stewardship automation",
  },
  {
    id: "l-tom-riley",
    name: "Tom Riley",
    title: "Membership Manager",
    seniority: "Manager",
    company: "Great Plains Public Media",
    targetAccount: false,
    relationship: "none",
    attended: false,
    pctAttended: 0,
    stayedToEnd: false,
    questionsAsked: 0,
    surveyCompleted: false,
    resourcesDownloaded: 1,
    priorWebinars: 2,
    topicSignal: "sustainer retention",
  },
  {
    id: "l-elena-cruz",
    name: "Elena Cruz",
    title: "Individual Giving Officer",
    seniority: "Manager",
    company: "Valley Food Bank",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 83,
    stayedToEnd: true,
    questionsAsked: 2,
    surveyCompleted: true,
    surveyInterest: "welcome-series design",
    resourcesDownloaded: 2,
    priorWebinars: 0,
    topicSignal: "new-donor onboarding",
  },
  {
    id: "l-frank-webb",
    name: "Frank Webb",
    title: "Executive Director",
    seniority: "C-suite",
    company: "Northgate Community Clinic",
    targetAccount: true,
    relationship: "none",
    attended: true,
    pctAttended: 47,
    stayedToEnd: false,
    questionsAsked: 0,
    surveyCompleted: false,
    resourcesDownloaded: 0,
    priorWebinars: 0,
    topicSignal: "general retention",
  },
  {
    id: "l-grace-kim",
    name: "Grace Kim",
    title: "Development Director",
    seniority: "Director",
    company: "Willow Creek Hospice",
    targetAccount: false,
    relationship: "client",
    attended: true,
    pctAttended: 90,
    stayedToEnd: true,
    questionsAsked: 1,
    surveyCompleted: true,
    surveyInterest: "recurring-gift upgrades",
    resourcesDownloaded: 3,
    priorWebinars: 2,
    topicSignal: "recurring giving",
  },
  {
    id: "l-luis-mendez",
    name: "Luis Mendez",
    title: "Fundraising Associate",
    seniority: "Individual",
    company: "Cedar Falls Land Trust",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 55,
    stayedToEnd: false,
    questionsAsked: 0,
    surveyCompleted: true,
    surveyInterest: "donor thank-you calls",
    resourcesDownloaded: 1,
    priorWebinars: 0,
    topicSignal: "donor gratitude",
  },
];

/** Leads ordered as a prioritized work queue (strongest opportunity first). */
export function prioritizedLeads(leads: Lead[]): Lead[] {
  const rank = (l: Lead) => {
    const step = recommendedNextStep(l).id;
    const stepBoost = step === "wait" ? -20 : step === "nurture" ? -6 : 0;
    const relBoost = l.relationship === "opportunity" ? 8 : l.relationship === "client" ? 4 : 0;
    const targetBoost = l.targetAccount ? 4 : 0;
    return engagementScore(l) + stepBoost + relBoost + targetBoost;
  };
  return [...leads].sort((a, b) => rank(b) - rank(a) || fnv1a(a.id) - fnv1a(b.id));
}
