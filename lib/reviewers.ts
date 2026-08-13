// Email Review Agents — a panel of reviewer "agents" that critique your PAST
// emails so the tool can learn from what already works before it drafts new
// follow-ups. The panel ships as an editable preset roster (mirrors the A/B
// tool's analyst bots) and the review distills into a reusable Baseline that
// conditions the drafting route.

export type Severity = "high" | "medium" | "low";

export interface ReviewAgent {
  id: string;
  name: string;
  focus: string; // short tagline shown on the card
  instruction: string; // what this agent critiques — fed into the AI prompt
  builtin?: boolean;
}

// A past email the user uploads/pastes as a baseline sample.
export interface PastEmail {
  id: string;
  label: string; // e.g. filename or "Pasted email 1"
  subject: string;
  body: string;
}

export interface Fix {
  text: string;
  severity: Severity;
}

export interface AgentCritique {
  agentId: string;
  agentName: string;
  score: number; // 0–100
  read: string; // one-line summary of how this agent read the email
  strengths: string[];
  fixes: Fix[];
}

export interface EmailReview {
  emailId: string;
  label: string;
  subject: string;
  overall: number; // 0–100, averaged across agents
  critiques: AgentCritique[];
}

// The distilled, reusable style profile the drafting builds on.
export interface EmailBaseline {
  voice: string;
  dos: string[];
  donts: string[];
  structure: string[];
  subjectTips: string[];
  emailsReviewed: number;
  avgScore: number;
}

export const DEFAULT_AGENTS: ReviewAgent[] = [
  {
    id: "brand",
    name: "Brand Voice",
    focus: "Tone & consistency",
    instruction:
      "Judge whether the email sounds warm, human, and peer-to-peer, consistent with a trusted advisor's voice. Flag anything corporate, salesy, or off-brand.",
    builtin: true,
  },
  {
    id: "copy",
    name: "Copy & Clarity",
    focus: "Structure & readability",
    instruction:
      "Judge clarity, brevity, and structure. Flag long sentences, buried leads, jargon, weak openings, and anything that makes the email harder to skim.",
    builtin: true,
  },
  {
    id: "deliver",
    name: "Deliverability & Trust",
    focus: "Inbox placement & credibility",
    instruction:
      "Judge spam risk and credibility. Flag spammy phrasing, excessive links, ALL CAPS, over-punctuation, unrealistic promises, and anything that erodes trust or hurts inbox placement.",
    builtin: true,
  },
  {
    id: "convert",
    name: "Conversion",
    focus: "Ask & next step",
    instruction:
      "Judge whether there is one clear, low-friction call to action. Flag missing asks, multiple competing CTAs, vague next steps, and high-pressure language.",
    builtin: true,
  },
  {
    id: "empathy",
    name: "Empathy",
    focus: "Reader relevance",
    instruction:
      "Judge whether the email is grounded in the reader's actual situation and interests rather than generic flattery. Flag one-size-fits-all copy and me-first framing.",
    builtin: true,
  },
];

export function newAgent(n: number): ReviewAgent {
  return {
    id: `agent-custom-${n}`,
    name: "New Agent",
    focus: "What it reviews",
    instruction: "Describe what this agent should critique in each email.",
  };
}

export function newPastEmail(n: number): PastEmail {
  return { id: `email-${n}`, label: `Pasted email ${n}`, subject: "", body: "" };
}
