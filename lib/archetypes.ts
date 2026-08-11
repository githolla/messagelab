// Industry "bots": the audience archetypes that react to a message, plus the
// specialist analyst bots that interpret those reactions. Picking an industry
// swaps in that industry's archetype panel; the analyst team is shared but
// reasons in the industry's context.

export interface Archetype {
  name: string;
  icon: string;
  how: string; // one line: how this bot judges the asset
  base: number; // 0-1 baseline propensity to act (drives deterministic demo)
}

export interface Analyst {
  key: string;
  label: string;
  icon: string;
  lens: string;
}

export const ANALYSTS: Analyst[] = [
  { key: "conversion", label: "Conversion", icon: "📈", lens: "funnel, CTA, friction, and what actually moves intent" },
  { key: "trust", label: "Trust", icon: "🛡️", lens: "credibility, proof, and risk cues" },
  { key: "accessibility", label: "Accessibility", icon: "♿", lens: "contrast, target sizes, legibility, and plain language" },
  { key: "copy", label: "Copy", icon: "✍️", lens: "message clarity, tone, and specificity" },
  { key: "brand", label: "Brand", icon: "🎨", lens: "consistency, differentiation, and emotional fit" },
];

const GENERAL: Archetype[] = [
  { name: "Skimmer", icon: "👀", how: "Scans headlines and bails in seconds unless the point is obvious", base: 0.3 },
  { name: "Skeptic", icon: "🔍", how: "Wants proof, specifics, and reasons to believe", base: 0.35 },
  { name: "Ready Buyer", icon: "✅", how: "Already interested — just needs a clear path to act", base: 0.7 },
  { name: "Comparison Shopper", icon: "⚖️", how: "Weighs you against alternatives before committing", base: 0.45 },
  { name: "Mobile User", icon: "📱", how: "One thumb, small screen, low patience", base: 0.4 },
];

export const INDUSTRY_ARCHETYPES: Record<string, Archetype[]> = {
  general: GENERAL,
  ecommerce: [
    { name: "Bargain Hunter", icon: "🛒", how: "Scans for price, discounts, and urgency", base: 0.5 },
    { name: "Brand Loyalist", icon: "💎", how: "Weighs trust, quality, and consistency", base: 0.7 },
    { name: "First-time Visitor", icon: "👀", how: "Needs to understand the offer in five seconds", base: 0.35 },
    { name: "Skeptical Researcher", icon: "🔍", how: "Hunts for reviews, specs, and proof", base: 0.4 },
    { name: "Mobile Impulse Buyer", icon: "📱", how: "Fast, one-thumb checkout or nothing", base: 0.55 },
  ],
  saas: [
    { name: "Decision-maker", icon: "🧭", how: "ROI and time-to-value in one glance", base: 0.5 },
    { name: "Hands-on Evaluator", icon: "🔧", how: "Wants specifics, docs, and a trial", base: 0.45 },
    { name: "Budget-conscious Buyer", icon: "💰", how: "Pricing clarity, no surprises", base: 0.4 },
    { name: "Security Reviewer", icon: "🛡️", how: "Compliance, data handling, and risk", base: 0.3 },
    { name: "Switcher", icon: "↔️", how: "Comparing you against their current tool", base: 0.5 },
  ],
  healthcare: [
    { name: "Anxious Patient", icon: "😟", how: "Reassurance, clarity, and an obvious next step", base: 0.55 },
    { name: "Caregiver", icon: "🤝", how: "Acting for someone else — needs trust", base: 0.6 },
    { name: "Older Adult", icon: "👓", how: "Legibility, simplicity, and no jargon", base: 0.45 },
    { name: "Privacy-conscious", icon: "🔒", how: "Wants to know where their data goes", base: 0.35 },
    { name: "Coverage-checker", icon: "🧾", how: "Cost and coverage before anything else", base: 0.4 },
  ],
  finance: [
    { name: "Cautious Saver", icon: "🐢", how: "Safety and trust over upside", base: 0.4 },
    { name: "Yield Seeker", icon: "📈", how: "Rates, returns, and fees", base: 0.55 },
    { name: "Fee-averse", icon: "🧮", how: "Hunts for hidden costs", base: 0.35 },
    { name: "First-time Investor", icon: "🌱", how: "Needs plain-language guidance", base: 0.45 },
    { name: "Compliance-minded", icon: "🛡️", how: "Regulation and security cues", base: 0.35 },
  ],
  media: [
    { name: "Casual Reader", icon: "📰", how: "Here for one thing, easily distracted", base: 0.4 },
    { name: "Subscriber Prospect", icon: "💳", how: "Weighing whether the paywall is worth it", base: 0.45 },
    { name: "Ad-averse Skimmer", icon: "🚫", how: "Bounces on clutter and interruption", base: 0.3 },
    { name: "Loyal Fan", icon: "⭐", how: "Deep engagement, wants more", base: 0.7 },
    { name: "Sharer", icon: "🔁", how: "Will spread it if it resonates", base: 0.5 },
  ],
  education: [
    { name: "Prospective Student", icon: "🎓", how: "Outcomes, cost, and fit", base: 0.5 },
    { name: "Parent", icon: "🤝", how: "Trust, safety, and value", base: 0.55 },
    { name: "Career-changer", icon: "🔄", how: "Time, ROI, and flexibility", base: 0.5 },
    { name: "Budget-conscious", icon: "💰", how: "Aid, price, and payoff", base: 0.4 },
    { name: "Skeptic", icon: "🔍", how: "Accreditation, proof, and reviews", base: 0.35 },
  ],
  travel: [
    { name: "Deal Seeker", icon: "🧳", how: "Price and dates first", base: 0.5 },
    { name: "Experience Seeker", icon: "🌅", how: "Photos, vibe, and uniqueness", base: 0.6 },
    { name: "Family Planner", icon: "👨‍👩‍👧", how: "Logistics, safety, and value", base: 0.5 },
    { name: "Last-minute Booker", icon: "⏱️", how: "Fast, mobile, decisive", base: 0.55 },
    { name: "Cautious Reviewer", icon: "🔍", how: "Reads reviews and refund policy", base: 0.4 },
  ],
  nonprofit: [
    { name: "Committed Donor", icon: "💚", how: "Mission alignment and impact", base: 0.75 },
    { name: "Impulse Giver", icon: "⚡", how: "Moved by story and a quick ask", base: 0.55 },
    { name: "Skeptical Giver", icon: "🔍", how: "Wants proof funds are used well", base: 0.4 },
    { name: "Lapsed Donor", icon: "🕰️", how: "Needs a reason to return", base: 0.35 },
    { name: "First-time Visitor", icon: "👀", how: "Doesn't know you yet", base: 0.3 },
  ],
};

export function panelFor(industryKey?: string): Archetype[] {
  return INDUSTRY_ARCHETYPES[industryKey ?? "general"] ?? GENERAL;
}

// Target ~20 reactions per run: spread instances evenly across the archetypes.
export function instancesPer(archetypeCount: number): number {
  return Math.max(3, Math.round(20 / Math.max(1, archetypeCount)));
}
