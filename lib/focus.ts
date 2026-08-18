// Focus Group — a simulated panel reviews ONE thing (a product/prototype, a
// go-to-market / sales / social strategy, a concept) and returns structured
// feedback: sentiment, likelihood to act, what resonates, concerns, questions,
// and suggestions — aggregated into an overview + charts. Deterministic demo
// path (fnv1a, no Math.random) so it runs with no API key; a key upgrades each
// reaction to a model read.

import { fnv1a, fnv1aFloat, clamp } from "./util";

export type FocusKind = "product" | "website" | "gtm" | "sales" | "social" | "concept" | "brand";

export interface FocusKindDef {
  key: FocusKind;
  label: string;
  blurb: string;
  subjectLabel: string;
  placeholder: string;
  images: boolean; // accepts prototype/asset uploads
  verb: string; // the action the likelihood measures
  actionLabel: string; // e.g. "Would try it"
  lens: string; // what the panel weighs (fed to the model)
}

export const FOCUS_KINDS: FocusKindDef[] = [
  {
    key: "product",
    label: "New product / feature",
    blurb: "A product or feature concept — attach prototype screenshots or mockups.",
    subjectLabel: "Describe the product or feature",
    placeholder: "What it is, who it's for, the core value, and how it works…",
    images: true,
    verb: "use it",
    actionLabel: "Would use it",
    lens: "desirability, must-have vs nice-to-have, willingness to pay/adopt, and dealbreakers",
  },
  {
    key: "website",
    label: "Website / landing page",
    blurb: "A site or landing page — add a screenshot and the panel reacts to it.",
    subjectLabel: "The website or landing page",
    placeholder: "What the page is for, its goal (sign up, buy, book…), and who it's aimed at…",
    images: true,
    verb: "take the next step",
    actionLabel: "Would take action",
    lens: "first impression, clarity of the offer, trust, the primary call-to-action, and where they'd get stuck",
  },
  {
    key: "gtm",
    label: "Go-to-market strategy",
    blurb: "A launch / GTM plan — positioning, ICP, channels, pricing.",
    subjectLabel: "Paste your go-to-market strategy",
    placeholder: "Target customer, positioning, channels, pricing, launch plan…",
    images: false,
    verb: "believe it would work",
    actionLabel: "Thinks it would work",
    lens: "positioning clarity, ICP fit, channel choice, pricing credibility, and the biggest risk to the plan",
  },
  {
    key: "sales",
    label: "Sales strategy / pitch",
    blurb: "A sales approach or pitch — how you'd win the deal.",
    subjectLabel: "Paste your sales strategy or pitch",
    placeholder: "The pitch, the offer, how you handle objections, the close…",
    images: false,
    verb: "buy",
    actionLabel: "Would buy",
    lens: "believability, objection handling, urgency, and what would actually move them to buy",
  },
  {
    key: "social",
    label: "Social media strategy",
    blurb: "A content / social plan — platforms, formats, cadence, hooks.",
    subjectLabel: "Paste your social media strategy",
    placeholder: "Platforms, content pillars, cadence, hooks, the campaign idea…",
    images: true,
    verb: "engage with it",
    actionLabel: "Would engage",
    lens: "platform fit, hook strength, scroll-stopping power, authenticity, and share-worthiness",
  },
  {
    key: "concept",
    label: "Concept / positioning",
    blurb: "A brand or product concept, tagline, or positioning statement.",
    subjectLabel: "Describe the concept or positioning",
    placeholder: "The idea, the promise, the tagline, why it matters…",
    images: true,
    verb: "be interested",
    actionLabel: "Would be interested",
    lens: "clarity, distinctiveness, emotional pull, believability, and relevance",
  },
  {
    key: "brand",
    label: "Brand / creative",
    blurb: "A brand identity, campaign, or creative direction.",
    subjectLabel: "Describe the brand or creative",
    placeholder: "The look, the voice, the campaign idea, the feeling you want…",
    images: true,
    verb: "connect with it",
    actionLabel: "Would connect",
    lens: "distinctiveness, memorability, emotional fit, and whether it feels credible",
  },
];

export function kindDef(k: FocusKind): FocusKindDef {
  return FOCUS_KINDS.find((x) => x.key === k) ?? FOCUS_KINDS[0];
}

export const PRODUCT_TYPES = [
  "SaaS / web app",
  "Mobile app",
  "Physical product",
  "Consumer service",
  "B2B service",
  "Marketplace",
  "Hardware / device",
  "Content / media",
  "Financial product",
  "Healthcare product",
  "Other",
];

export interface FocusSubject {
  kind: FocusKind;
  industry: string;
  productType: string;
  format?: string; // the form it takes (email, direct mail, social post, landing page…)
  title: string;
  body: string;
  images: string[]; // data URLs
}

export type Sentiment = "love" | "like" | "neutral" | "skeptical" | "reject";
export const SENTIMENTS: Sentiment[] = ["love", "like", "neutral", "skeptical", "reject"];
export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  love: "Love it", like: "Like it", neutral: "Neutral", skeptical: "Skeptical", reject: "Would reject",
};
export const SENTIMENT_SCORE: Record<Sentiment, number> = { love: 5, like: 4, neutral: 3, skeptical: 2, reject: 1 };

export interface FocusReaction {
  personaId: string;
  personaName: string;
  segment: string;
  segmentHow?: string;
  sentiment: Sentiment;
  likelihood: number; // 1-5
  resonates: string;
  concern: string;
  question: string;
  suggestion: string;
  quote: string;
  model?: string;
  error?: string;
  /** Present when the persona-agent actually navigated a live site (website kind). */
  journey?: WalkStep[];
}

/** One step of a persona-agent's walk through a live site. */
export interface WalkStep {
  n: number;
  action: "start" | "click" | "scroll" | "back" | "done";
  target?: string; // the label/href acted on, or the page arrived at
  url: string;
  thought: string; // in-character reason for the move
}

// ---- Deterministic demo feedback ----------------------------------------

const RESONATES = [
  "the core promise is clear and I get the value fast",
  "it solves a real problem I actually have",
  "the positioning feels sharp and differentiated",
  "it's simple — no learning curve to see the point",
  "the proof / specifics made it feel credible",
  "it fits naturally into how I already work",
];
const CONCERNS = [
  "I'm not sure it's different enough from what I already use",
  "the price / cost isn't clear enough to judge",
  "it feels like it could be more than I need",
  "I'd worry about switching and migration effort",
  "trust — I'd need proof it actually delivers",
  "the value is there but the timing feels off for me",
];
const QUESTIONS = [
  "How is this different from the alternatives?",
  "What does it actually cost, all-in?",
  "How long until I see a result?",
  "Who else like me is already using it?",
  "What happens to my existing setup / data?",
  "Is there a way to try it before committing?",
];
const SUGGESTIONS = [
  "lead with the one outcome that matters most",
  "add a concrete proof point or a customer example",
  "make the pricing and the next step obvious",
  "cut a step — it feels slightly heavier than it needs to be",
  "speak more directly to my specific situation",
  "show it in action rather than describing it",
];
const QUOTE_POS = [
  "Honestly, I'd want this — it hits something I care about.",
  "This is compelling. I could see myself going for it.",
  "Clear, useful, and it feels made for me.",
];
const QUOTE_NEU = [
  "It's fine — I'd need a bit more before I'm sold.",
  "I see the idea, but it hasn't fully landed for me yet.",
  "Interesting, though I'm on the fence.",
];
const QUOTE_NEG = [
  "Not for me as-is — I'm not convinced it's worth the switch.",
  "It didn't give me a strong enough reason to act.",
  "I'd pass right now; the value isn't clear enough.",
];

function pick(bank: string[], seed: string): string {
  return bank[fnv1a(seed) % bank.length];
}

export function focusDemo(
  reaction: { id: string; name: string; segment: string; how?: string; base?: number },
  subject: FocusSubject,
): FocusReaction {
  const base = reaction.base ?? 0.55;
  // Segment-level lean + per-person jitter, widened so the room spreads across
  // the sentiment scale (a real focus group is rarely unanimous).
  const lean = (fnv1aFloat(`${reaction.segment}|${subject.kind}`) - 0.5) * 0.34;
  const jit = (fnv1aFloat(reaction.id + "f") - 0.5) * 0.62;
  const score = clamp(base + lean + jit, 0, 1);
  const sentiment: Sentiment =
    score > 0.8 ? "love" : score > 0.6 ? "like" : score > 0.42 ? "neutral" : score > 0.26 ? "skeptical" : "reject";
  const likelihood = clamp(Math.round(score * 4 + 1), 1, 5);
  const quoteBank = score > 0.6 ? QUOTE_POS : score > 0.42 ? QUOTE_NEU : QUOTE_NEG;
  return {
    personaId: reaction.id,
    personaName: reaction.name,
    segment: reaction.segment,
    segmentHow: reaction.how,
    sentiment,
    likelihood,
    resonates: pick(RESONATES, reaction.id + "r"),
    concern: pick(CONCERNS, reaction.id + "c"),
    question: pick(QUESTIONS, reaction.id + "q"),
    suggestion: pick(SUGGESTIONS, reaction.id + "s"),
    quote: pick(quoteBank, reaction.id + "u"),
  };
}

// ---- Aggregation ---------------------------------------------------------

export interface Theme {
  text: string;
  count: number;
}
export type FocusVerdict = "greenlight" | "promising" | "mixed" | "rework";
export const FOCUS_VERDICT_LABEL: Record<FocusVerdict, string> = {
  greenlight: "Green-light", promising: "Promising", mixed: "Mixed", rework: "Rework",
};

export interface SegmentBreakdown {
  segment: string;
  n: number;
  avgSentiment: number;
  positivePct: number;
}
export interface FocusSummary {
  n: number;
  avgSentiment: number; // 1-5
  avgLikelihood: number; // 1-5
  positivePct: number; // love + like
  negativePct: number; // skeptical + reject
  sentimentDist: { key: Sentiment; count: number }[];
  likelihoodDist: number[]; // index 0..4 → likelihood 1..5
  verdict: FocusVerdict;
  headline: string;
  themes: { resonates: Theme[]; concerns: Theme[]; questions: Theme[]; suggestions: Theme[] };
  bySegment: SegmentBreakdown[];
}

function themeCount(items: string[]): Theme[] {
  const m = new Map<string, number>();
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    m.set(key, (m.get(key) || 0) + 1);
  }
  // Keep first-seen original casing for display.
  const display = new Map<string, string>();
  for (const raw of items) {
    const k = raw.trim().toLowerCase();
    if (k && !display.has(k)) display.set(k, raw.trim());
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, c]) => ({ text: display.get(k) || k, count: c }));
}

export function summarizeFocus(reactions: FocusReaction[], kind: FocusKind): FocusSummary {
  const n = reactions.length || 1;
  const avgSentiment = reactions.reduce((t, r) => t + SENTIMENT_SCORE[r.sentiment], 0) / n;
  const avgLikelihood = reactions.reduce((t, r) => t + r.likelihood, 0) / n;
  const sentimentDist = SENTIMENTS.map((k) => ({ key: k, count: reactions.filter((r) => r.sentiment === k).length }));
  const likelihoodDist = [1, 2, 3, 4, 5].map((v) => reactions.filter((r) => r.likelihood === v).length);
  const positive = reactions.filter((r) => r.sentiment === "love" || r.sentiment === "like").length;
  const negative = reactions.filter((r) => r.sentiment === "skeptical" || r.sentiment === "reject").length;
  const positivePct = Math.round((positive / n) * 100);
  const negativePct = Math.round((negative / n) * 100);

  const verdict: FocusVerdict =
    avgSentiment >= 4 && positivePct >= 55 ? "greenlight"
      : avgSentiment >= 3.4 ? "promising"
        : avgSentiment >= 2.7 ? "mixed"
          : "rework";

  const def = kindDef(kind);
  const headline =
    verdict === "greenlight"
      ? `Strong reception — ${positivePct}% are positive and would ${def.verb}. Ship it, addressing the top concern.`
      : verdict === "promising"
        ? `Promising — ${positivePct}% positive, but the concerns below are holding some of the room back.`
        : verdict === "mixed"
          ? `Mixed — the room is split (${positivePct}% positive / ${negativePct}% negative). The concerns tell you what to fix.`
          : `Needs work — ${negativePct}% are skeptical or would reject it. Address the concerns before pushing further.`;

  const bySegmentMap = new Map<string, FocusReaction[]>();
  for (const r of reactions) {
    const arr = bySegmentMap.get(r.segment) || [];
    arr.push(r);
    bySegmentMap.set(r.segment, arr);
  }
  const bySegment: SegmentBreakdown[] = [...bySegmentMap.entries()].map(([segment, rs]) => ({
    segment,
    n: rs.length,
    avgSentiment: rs.reduce((t, r) => t + SENTIMENT_SCORE[r.sentiment], 0) / rs.length,
    positivePct: Math.round((rs.filter((r) => r.sentiment === "love" || r.sentiment === "like").length / rs.length) * 100),
  })).sort((a, b) => b.avgSentiment - a.avgSentiment);

  return {
    n: reactions.length,
    avgSentiment,
    avgLikelihood,
    positivePct,
    negativePct,
    sentimentDist,
    likelihoodDist,
    verdict,
    headline,
    themes: {
      resonates: themeCount(reactions.map((r) => r.resonates)),
      concerns: themeCount(reactions.map((r) => r.concern)),
      questions: themeCount(reactions.map((r) => r.question)),
      suggestions: themeCount(reactions.map((r) => r.suggestion)),
    },
    bySegment,
  };
}
