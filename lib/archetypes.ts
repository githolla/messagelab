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

// A 2-letter monogram from a name — used in place of emoji on bot/analyst chips.
// "Bargain Hunter" -> "BH", "Conversion" -> "CO", "First-time Visitor" -> "FV".
export function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 -]/g, "").split(/[ -]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?").toUpperCase();
}

// Deterministic human name + member number for a panelist, so the focus group
// reads as a room of named people rather than "Skimmer #1". No Math.random —
// derived from the persona's stable id so reruns/demos are reproducible.
const FIRST_NAMES = [
  "Maya", "Liam", "Sofia", "Ethan", "Priya", "Noah", "Ava", "Diego", "Chloe", "Omar",
  "Zoe", "Marcus", "Nina", "Kenji", "Aisha", "Lucas", "Elena", "Tariq", "Grace", "Andre",
  "Yuki", "Hassan", "Clara", "Mateo", "Fatima", "Owen", "Leila", "Sven", "Rina", "Cole",
  "Ingrid", "Rahul", "Bianca", "Theo", "Amara", "Felix", "Dara", "Nikolai", "Talia", "Wei",
];
const LAST_NAMES = [
  "Chen", "Okafor", "Rossi", "Nguyen", "Patel", "Kim", "Silva", "Haddad", "Novak", "Mbeki",
  "Torres", "Larsen", "Ahmed", "Bennett", "Kowalski", "Reyes", "Sato", "Dubois", "Weber", "Ali",
  "Ivanova", "Costa", "Fischer", "Mensah", "Park", "Romano", "Yilmaz", "Petrov", "Kaur", "Moreau",
];

export function personaName(seed: string): string {
  const f = FIRST_NAMES[monogramHash(seed) % FIRST_NAMES.length];
  const l = LAST_NAMES[monogramHash(seed + "•") % LAST_NAMES.length];
  return `${f} ${l}`;
}

export function memberNo(seed: string): string {
  return "#" + String(1000 + (monogramHash(seed + "#") % 9000));
}

function monogramHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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
  banking: [
    { name: "Rate Shopper", icon: "💹", how: "Comparing APY and fees before switching", base: 0.45 },
    { name: "Trust-first Saver", icon: "🏦", how: "Security and stability over perks", base: 0.5 },
    { name: "Digital-native", icon: "📱", how: "Wants a slick app and instant setup", base: 0.55 },
    { name: "Fee-averse", icon: "🧮", how: "Bails at the first hidden charge", base: 0.35 },
    { name: "Small Business Owner", icon: "💼", how: "Cash flow, tools, and support", base: 0.5 },
  ],
  mortgage: [
    { name: "First-time Buyer", icon: "🔑", how: "Anxious — needs hand-holding and clarity", base: 0.5 },
    { name: "Rate Watcher", icon: "📉", how: "Chasing the lowest APR", base: 0.45 },
    { name: "Refinancer", icon: "♻️", how: "Will move for real savings", base: 0.5 },
    { name: "Credit-cautious", icon: "😬", how: "Worried they won't qualify", base: 0.35 },
    { name: "Property Investor", icon: "🏘️", how: "Speed and terms for the next deal", base: 0.55 },
  ],
  insurance: [
    { name: "Price Shopper", icon: "💵", how: "Cheapest quote wins", base: 0.45 },
    { name: "Coverage-anxious", icon: "🛡️", how: "Fears being under-covered", base: 0.5 },
    { name: "Switcher", icon: "↔️", how: "Frustrated with their current insurer", base: 0.5 },
    { name: "Claims Skeptic", icon: "🔍", how: "Will they actually pay out?", base: 0.35 },
    { name: "Bundler", icon: "📦", how: "Wants everything in one place", base: 0.55 },
  ],
  realestate: [
    { name: "First-time Buyer", icon: "🔑", how: "Overwhelmed — needs guidance", base: 0.5 },
    { name: "Investor", icon: "🏘️", how: "Numbers, yield, and location", base: 0.55 },
    { name: "Upsizing Family", icon: "👨‍👩‍👧", how: "Space, schools, and safety", base: 0.55 },
    { name: "Browser", icon: "👀", how: "Just looking, easily distracted", base: 0.3 },
    { name: "Seller", icon: "🏷️", how: "Wants top price and low hassle", base: 0.5 },
  ],
  fitness: [
    { name: "Motivated Starter", icon: "🔥", how: "Ready now if it's easy to begin", base: 0.65 },
    { name: "Skeptic", icon: "🙄", how: "Seen the hype, wants proof", base: 0.35 },
    { name: "Busy Professional", icon: "⏱️", how: "Needs it to fit a packed schedule", base: 0.45 },
    { name: "Deal Seeker", icon: "💵", how: "Waiting for the right offer", base: 0.45 },
    { name: "Comeback Returner", icon: "🔄", how: "Restarting after a lapse", base: 0.5 },
  ],
  restaurants: [
    { name: "Hungry Now", icon: "🍽️", how: "Wants to order or reserve fast", base: 0.6 },
    { name: "Foodie", icon: "🌟", how: "Chasing quality and novelty", base: 0.55 },
    { name: "Deal Seeker", icon: "💵", how: "Coupons, specials, and value", base: 0.5 },
    { name: "Family Diner", icon: "👨‍👩‍👧", how: "Kid-friendly, easy, reliable", base: 0.5 },
    { name: "Event Planner", icon: "🎉", how: "Booking for a group or occasion", base: 0.5 },
  ],
  automotive: [
    { name: "Ready Buyer", icon: "🚗", how: "In-market, wants a deal now", base: 0.6 },
    { name: "Researcher", icon: "🔍", how: "Specs, reviews, comparisons", base: 0.4 },
    { name: "Finance-focused", icon: "💳", how: "Monthly payment and terms", base: 0.5 },
    { name: "Trade-in Owner", icon: "🔁", how: "What's my car worth?", base: 0.5 },
    { name: "Service Customer", icon: "🔧", how: "Trust and convenience for upkeep", base: 0.45 },
  ],
  telecom: [
    { name: "Bill-shocked", icon: "😤", how: "Fed up with rising costs", base: 0.5 },
    { name: "Speed Seeker", icon: "⚡", how: "Wants fast, reliable service", base: 0.5 },
    { name: "Switcher", icon: "↔️", how: "Shopping a better plan", base: 0.5 },
    { name: "Bundle Hunter", icon: "📦", how: "Combine services to save", base: 0.5 },
    { name: "Contract-wary", icon: "📄", how: "Fears lock-in and fees", base: 0.35 },
  ],
  energy: [
    { name: "Cost Cutter", icon: "💡", how: "Chasing a lower bill", base: 0.5 },
    { name: "Green Switcher", icon: "🌱", how: "Wants clean-energy options", base: 0.5 },
    { name: "Skeptic", icon: "🤨", how: "Doubts the savings are real", base: 0.35 },
    { name: "Set-and-forget", icon: "🔁", how: "Wants simple, reliable service", base: 0.5 },
    { name: "Small Business", icon: "💼", how: "Predictable costs and support", base: 0.45 },
  ],
  legal: [
    { name: "Stressed Client", icon: "😟", how: "Needs reassurance and clarity", base: 0.55 },
    { name: "Comparison Shopper", icon: "⚖️", how: "Vetting a few firms", base: 0.45 },
    { name: "Cost-conscious", icon: "💵", how: "Worried about fees", base: 0.4 },
    { name: "Urgent Case", icon: "⏱️", how: "Needs help immediately", base: 0.6 },
    { name: "Skeptic", icon: "🔍", how: "Wants proof of results", base: 0.35 },
  ],
  homeservices: [
    { name: "Urgent Need", icon: "🚨", how: "Something broke — needs it fixed now", base: 0.65 },
    { name: "Quote Comparer", icon: "⚖️", how: "Getting a few estimates", base: 0.45 },
    { name: "Trust-first", icon: "🛡️", how: "Reviews and reliability matter most", base: 0.5 },
    { name: "Budget-conscious", icon: "💵", how: "Price and value first", base: 0.45 },
    { name: "Planner", icon: "📅", how: "Scheduling a non-urgent project", base: 0.45 },
  ],
  b2b: [
    { name: "Decision-maker", icon: "🧭", how: "ROI and outcomes in one glance", base: 0.5 },
    { name: "Researcher", icon: "🔧", how: "Case studies, proof, and detail", base: 0.45 },
    { name: "Budget-holder", icon: "💰", how: "Cost and justification", base: 0.4 },
    { name: "Skeptic", icon: "🛡️", how: "Wary of agency promises", base: 0.35 },
    { name: "Referral-led", icon: "🤝", how: "Came on a recommendation", base: 0.6 },
  ],
  recruiting: [
    { name: "Passive Candidate", icon: "😐", how: "Happy where they are — needs a real reason to reply", base: 0.35 },
    { name: "Active Job Seeker", icon: "🔍", how: "Open to moves, scanning for fit and comp", base: 0.6 },
    { name: "Recruiter-skeptic", icon: "🙄", how: "Assumes it's spam or a mismatch", base: 0.3 },
    { name: "Comp-driven", icon: "💰", how: "Reply hinges on clear salary and level", base: 0.45 },
    { name: "Mission-driven", icon: "🌟", how: "Cares about the work, team, and impact", base: 0.5 },
  ],
  government: [
    { name: "Task-focused Citizen", icon: "📋", how: "Needs to complete one thing", base: 0.55 },
    { name: "Confused Navigator", icon: "😕", how: "Lost in jargon and options", base: 0.35 },
    { name: "Accessibility-dependent", icon: "♿", how: "Needs clear, legible, simple", base: 0.45 },
    { name: "Skeptic", icon: "🤨", how: "Distrusts the process", base: 0.35 },
    { name: "Deadline-driven", icon: "⏱️", how: "Racing a due date", base: 0.55 },
  ],
  gaming: [
    { name: "Hype Chaser", icon: "🔥", how: "Wants the next big thing", base: 0.6 },
    { name: "Value Gamer", icon: "💵", how: "Judging bang-for-buck", base: 0.45 },
    { name: "Skeptic", icon: "🎮", how: "Burned by overhyped launches", base: 0.35 },
    { name: "Social Player", icon: "👥", how: "Plays what friends play", base: 0.5 },
    { name: "Completionist", icon: "🏆", how: "Depth and content matter", base: 0.5 },
  ],
  crypto: [
    { name: "Curious Newcomer", icon: "🌱", how: "Interested but wary", base: 0.4 },
    { name: "Skeptic", icon: "🚩", how: "Assumes it's a scam until proven", base: 0.3 },
    { name: "Active Trader", icon: "📈", how: "Chasing upside and speed", base: 0.55 },
    { name: "Security-first", icon: "🔒", how: "Custody and safety above all", base: 0.4 },
    { name: "Builder", icon: "🛠️", how: "Evaluating the tech and team", base: 0.45 },
  ],
};

// Audience-state modifiers. The message type implies WHO is receiving it (a
// win-back goes to lapsed customers, onboarding to brand-new ones), so we lead
// the industry panel with a state archetype that matches the message type. Icon
// is unused (the UI renders monograms), kept for the shared Archetype shape.
const AUDIENCE: Record<string, Archetype> = {
  new: { name: "New Arrival", icon: "", how: "Just discovered you — needs the value obvious in seconds, no jargon", base: 0.3 },
  lapsed: { name: "Lapsed Customer", icon: "", how: "Used to engage, then went quiet — needs a genuine reason to come back", base: 0.25 },
  hesitating: { name: "Hesitating Buyer", icon: "", how: "Was about to act and stopped — one objection away from converting", base: 0.6 },
  renewing: { name: "Renewing Customer", icon: "", how: "Already a customer deciding whether to stay — weighs value vs. alternatives", base: 0.55 },
  upsell: { name: "Upsell Candidate", icon: "", how: "Happy customer weighing whether to spend more", base: 0.5 },
  warm: { name: "Warm Prospect", icon: "", how: "Talked to you once then went quiet — needs a nudge with real substance", base: 0.45 },
  advocate: { name: "Potential Referrer", icon: "", how: "Likes you enough to refer — needs it easy and worth their while", base: 0.5 },
  loyal: { name: "Loyal Regular", icon: "", how: "Deeply engaged already — wants recognition and what's next", base: 0.7 },
};

/** Infer the audience state a message type targets, from its wording. */
export function messageAudienceKey(messageType?: string): keyof typeof AUDIENCE | null {
  if (!messageType) return null;
  const s = messageType.toLowerCase();
  if (/welcome|onboard|new-patient|new patient|first-time|first time|new account|new-account|prospective|apply invite|info session/.test(s)) return "new";
  if (/win-back|winback|win back|re-engag|reengag|lapsed|dormant|recall/.test(s)) return "lapsed";
  if (/abandon|cart|pre-trip|hesitat/.test(s)) return "hesitating";
  if (/renew|retention|expir|lease-end|contract reminder|autopay|bill /.test(s)) return "renewing";
  if (/upsell|cross-sell|upgrade|expansion|add-on|premium|catering|group offer/.test(s)) return "upsell";
  if (/follow-up|follow up|application follow|case follow|nurture|application follow-up|closing|next steps|interview/.test(s)) return "warm";
  if (/referral|refer a|share/.test(s)) return "advocate";
  if (/loyal|vip|milestone|community update|impact update/.test(s)) return "loyal";
  return null; // promotional / announcement / newsletter → the base audience
}

// The panel for a run: the industry's archetypes, led by an audience-state
// archetype when the message type implies a specific audience. Panel size holds.
export function panelFor(industryKey?: string, messageType?: string): Archetype[] {
  const base = INDUSTRY_ARCHETYPES[industryKey ?? "general"] ?? GENERAL;
  const key = messageAudienceKey(messageType);
  if (!key) return base;
  const state = AUDIENCE[key];
  return [state, ...base.filter((a) => a.name !== state.name)].slice(0, base.length);
}

// Target ~20 reactions per run: spread instances evenly across the archetypes.
export function instancesPer(archetypeCount: number): number {
  return Math.max(3, Math.round(20 / Math.max(1, archetypeCount)));
}

// An editable audience segment in the panel builder: an archetype plus a chosen
// headcount (how many simulated people of this type are in the panel).
export interface PanelSegment {
  id: string;
  name: string;
  how: string;
  base: number;
  count: number;
}

// Auto-fill the panel for an industry + message type, distributing `total`
// people across the archetypes (the lead audience gets the largest share).
export function autoSegments(industryKey: string | undefined, messageType: string | undefined, total: number): PanelSegment[] {
  const arch = panelFor(industryKey, messageType);
  const segs: PanelSegment[] = arch.map((a, i) => ({
    id: `${a.name}-${i}`,
    name: a.name,
    how: a.how,
    base: a.base,
    count: 0,
  }));
  return distribute(segs, Math.max(arch.length, Math.round(total)));
}

// Re-distribute a total headcount across existing segments, weighted to their
// current shares (used by the size presets + the "resize" control). Every
// non-empty segment keeps at least one person.
export function scaleSegments(segs: PanelSegment[], total: number): PanelSegment[] {
  if (!segs.length) return segs;
  const cur = segs.reduce((t, s) => t + s.count, 0);
  const base = cur > 0 ? segs.map((s) => s.count) : segs.map(() => 1);
  const sum = base.reduce((t, n) => t + n, 0) || 1;
  const out = segs.map((s, i) => ({ ...s, count: Math.max(1, Math.round((base[i] / sum) * total)) }));
  return fix(out, total);
}

function distribute(segs: PanelSegment[], total: number): PanelSegment[] {
  const n = segs.length;
  const per = Math.floor(total / n);
  const out = segs.map((s, i) => ({ ...s, count: per + (i === 0 ? total - per * n : 0) }));
  return out.map((s) => ({ ...s, count: Math.max(1, s.count) }));
}

// Nudge counts so they sum exactly to `total` after rounding.
function fix(segs: PanelSegment[], total: number): PanelSegment[] {
  const out = segs.map((s) => ({ ...s }));
  let diff = total - out.reduce((t, s) => t + s.count, 0);
  for (let i = 0; diff !== 0 && i < out.length * 6; i++) {
    const s = out[i % out.length];
    if (diff > 0) { s.count += 1; diff -= 1; }
    else if (s.count > 1) { s.count -= 1; diff += 1; }
  }
  return out;
}
