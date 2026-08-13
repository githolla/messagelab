// Deterministic email-review engine. Produces per-agent critiques and a
// distilled baseline with NO API call, so the panel works in demo / no-key mode
// exactly like the rest of the app (no Math.random anywhere). The live
// /api/email-review route upgrades this with a model when a key is present.

import type {
  ReviewAgent,
  PastEmail,
  AgentCritique,
  EmailReview,
  EmailBaseline,
  Fix,
  Severity,
} from "./reviewers";

const SPAM = [
  "free", "guarantee", "guaranteed", "act now", "limited time", "urgent", "click here",
  "buy now", "risk-free", "100%", "winner", "cash", "cheap", "offer expires", "don't miss",
  "exclusive deal", "amazing", "incredible", "once in a lifetime",
];
const JARGON = [
  "synergy", "leverage", "circle back", "touch base", "low-hanging fruit", "bandwidth",
  "move the needle", "value-add", "utilize", "paradigm", "best-in-class", "cutting-edge",
  "solutions", "seamless", "robust", "holistic",
];
const GENERIC = [
  "valued customer", "dear friend", "dear sir", "to whom it may concern", "we are excited",
  "we're excited", "our company", "we believe", "at our organization", "hope this email finds you well",
];
const ASK_VERBS = ["reply", "schedule", "book", "grab", "let me know", "would you", "are you open", "can we", "join", "register", "download", "read", "check out", "call", "meet"];

interface Sig {
  words: number;
  sentences: number;
  avgSentence: number;
  subjectWords: number;
  exclamations: number;
  capsWords: number;
  links: number;
  questions: number;
  youDensity: number; // you/your per 100 words
  hasGreeting: boolean;
  hasSignoff: boolean;
  paragraphs: number;
  hasToken: boolean; // {{name}}-style merge token
  weDensity: number; // we/our/us per 100 words
  spam: string[];
  jargon: string[];
  generic: string[];
  hasAsk: boolean;
  weakOpen: boolean;
}

function countHits(hay: string, needles: string[]): string[] {
  const l = hay.toLowerCase();
  return needles.filter((n) => l.includes(n));
}

function analyze(e: PastEmail): Sig {
  const body = e.body || "";
  const words = (body.match(/\b[\w'-]+\b/g) || []).length || 1;
  const sentences = Math.max(1, (body.match(/[.!?]+/g) || []).length);
  const you = (body.match(/\b(you|your|you're|you've)\b/gi) || []).length;
  const we = (body.match(/\b(we|our|us|we're|we've)\b/gi) || []).length;
  const firstLine = body.trim().split(/\n/)[0] || "";
  return {
    words,
    sentences,
    avgSentence: words / sentences,
    subjectWords: (e.subject.match(/\b[\w'-]+\b/g) || []).length,
    exclamations: (body.match(/!/g) || []).length,
    capsWords: (body.match(/\b[A-Z]{3,}\b/g) || []).length,
    links: (body.match(/https?:\/\/|\bclick here\b/gi) || []).length,
    questions: (body.match(/\?/g) || []).length,
    youDensity: (you / words) * 100,
    hasGreeting: /^(hi|hello|dear|hey)\b/i.test(body.trim()),
    hasSignoff: /(thanks|best|warmly|regards|sincerely|cheers|—\s*\w)/i.test(body.slice(-120)),
    paragraphs: body.split(/\n\s*\n/).filter((p) => p.trim()).length,
    hasToken: /\{\{.*?\}\}|\[first[_ ]?name\]/i.test(body),
    weDensity: (we / words) * 100,
    spam: countHits(body, SPAM),
    jargon: countHits(body, JARGON),
    generic: countHits(body, GENERIC),
    hasAsk: ASK_VERBS.some((v) => body.toLowerCase().includes(v)) || (body.match(/\?/g) || []).length > 0,
    weakOpen: /^(i|we)\b/i.test(firstLine.replace(/^(hi|hello|dear|hey)[^,]*,?\s*/i, "")),
  };
}

const clamp = (n: number) => Math.max(18, Math.min(98, Math.round(n)));
const cap = (n: number, max: number) => Math.min(n, max);

function critique(agent: ReviewAgent, s: Sig): AgentCritique {
  let score = 93;
  const strengths: string[] = [];
  const fixes: Fix[] = [];
  const add = (text: string, severity: Severity, penalty: number) => {
    fixes.push({ text, severity });
    score -= penalty;
  };

  switch (agent.id) {
    case "brand": {
      if (s.spam.length) add(`Reads salesy — ${s.spam.length} promo phrase${s.spam.length > 1 ? "s" : ""} like "${s.spam[0]}".`, "high", cap(14 + 6 * (s.spam.length - 1), 36));
      if (s.exclamations > 1) add(`${s.exclamations} exclamation points undercut a calm, trusted tone.`, "medium", cap(4 + 4 * (s.exclamations - 1), 14));
      if (s.capsWords > 0) add("ALL-CAPS words feel shouty; use plain emphasis.", "medium", 8);
      if (s.jargon.length) add(`Corporate jargon ("${s.jargon[0]}") flattens the human voice.`, "low", cap(5 + 3 * (s.jargon.length - 1), 14));
      if (!s.spam.length && s.exclamations <= 1) strengths.push("Tone stays calm and non-salesy");
      if (s.hasGreeting) strengths.push("Opens with a personal greeting");
      break;
    }
    case "copy": {
      if (s.avgSentence > 30) add(`Very long sentences (avg ${Math.round(s.avgSentence)} words) — break them up.`, "medium", 16);
      else if (s.avgSentence > 22) add(`Long sentences (avg ${Math.round(s.avgSentence)} words) — break them up.`, "medium", 10);
      if (s.words > 320) add(`At ${s.words} words it's a wall of text; aim for 120–160.`, "high", 20);
      else if (s.words > 220) add(`At ${s.words} words it runs long; aim for 120–160.`, "high", 14);
      if (s.paragraphs < 2 && s.words > 80) add("One dense block — add paragraph breaks so it's skimmable.", "medium", 9);
      if (s.weakOpen) add('Opens with "I/We" — lead with the reader instead.', "medium", 8);
      if (s.subjectWords > 9) add(`Subject is ${s.subjectWords} words; tighten to ~6 so it doesn't truncate.`, "low", 6);
      if (s.words <= 200 && s.words >= 60) strengths.push("Length is tight and scannable");
      if (s.paragraphs >= 2) strengths.push("Broken into skimmable paragraphs");
      break;
    }
    case "deliver": {
      if (s.spam.length) add(`Spam-trigger language ("${s.spam.slice(0, 2).join('", "')}") risks the junk folder.`, "high", cap(14 + 6 * (s.spam.length - 1), 38));
      if (s.links > 1) add(`${s.links} links raises spam score — keep it to one.`, "medium", cap(7 * (s.links - 1), 20));
      if (s.capsWords > 0) add("ALL-CAPS words trip spam filters.", "medium", 8);
      if (s.exclamations > 1) add("Heavy punctuation looks promotional to filters.", "low", cap(3 * s.exclamations, 12));
      if (!s.spam.length && s.links <= 1) strengths.push("Clean of spam triggers; likely to land in the inbox");
      break;
    }
    case "convert": {
      if (!s.hasAsk) add("No clear ask — the reader doesn't know what to do next.", "high", 20);
      if (s.links > 1) add(`${s.links} competing links dilute the one next step.`, "medium", cap(7 * (s.links - 1), 18));
      if (s.spam.some((w) => ["act now", "urgent", "limited time", "don't miss", "offer expires"].includes(w)))
        add("High-pressure phrasing hurts more than it helps at this stage.", "medium", 12);
      if (s.hasAsk && s.links <= 1) strengths.push("Ends with a single, clear next step");
      if (s.questions === 1) strengths.push("A soft question invites a reply");
      break;
    }
    case "empathy": {
      if (s.generic.length) add(`Generic filler ("${s.generic[0]}") — replace with something specific to them.`, "high", cap(12 + 6 * (s.generic.length - 1), 26));
      if (s.youDensity < 1.2) add("Very reader-light — more “you/your”, less “we/our”.", "medium", 10);
      else if (s.youDensity < 2) add("Lean more on the reader — raise the “you/your” to “we/our” ratio.", "low", 6);
      if (s.weDensity > s.youDensity + 1) add("Me-first framing — it talks about the sender more than the reader.", "medium", 10);
      if (s.hasToken) strengths.push("Uses a merge token to personalize at scale");
      if (s.youDensity >= 2 && s.weDensity <= s.youDensity) strengths.push("Keeps the focus on the reader");
      if (!s.generic.length) strengths.push("Avoids one-size-fits-all filler");
      break;
    }
    default: {
      // Custom agent: light, generic heuristic so it still returns something useful.
      if (s.spam.length) add(`Consider your focus ("${agent.focus}") — flagged phrasing like "${s.spam[0]}".`, "medium", 10);
      if (s.words > 220) add("Long for a follow-up; tighten it.", "low", 6);
      if (!s.spam.length) strengths.push("No obvious issues for this lens");
    }
  }

  const read =
    fixes.length === 0
      ? "Strong on this dimension — nothing material to fix."
      : fixes.some((f) => f.severity === "high")
      ? "Has a significant issue worth fixing before reuse."
      : "Solid, with a few refinements to tighten it.";

  return { agentId: agent.id, agentName: agent.name, score: clamp(score), read, strengths, fixes };
}

export function reviewEmail(agents: ReviewAgent[], e: PastEmail): EmailReview {
  const s = analyze(e);
  const critiques = agents.map((a) => critique(a, s));
  const overall = Math.round(critiques.reduce((t, c) => t + c.score, 0) / (critiques.length || 1));
  return { emailId: e.id, label: e.label, subject: e.subject, overall, critiques };
}

export function reviewAll(agents: ReviewAgent[], emails: PastEmail[]): EmailReview[] {
  return emails.map((e) => reviewEmail(agents, e));
}

// Distill the reviews into a reusable baseline the drafting builds on.
export function buildBaseline(reviews: EmailReview[], emails: PastEmail[]): EmailBaseline {
  const sigs = emails.map(analyze);
  const n = Math.max(1, emails.length);
  const avg = (f: (s: Sig) => number) => sigs.reduce((t, s) => t + f(s), 0) / n;
  const avgWords = avg((s) => s.words);
  const avgSubject = avg((s) => s.subjectWords);
  const avgYou = avg((s) => s.youDensity);
  const anySpam = sigs.some((s) => s.spam.length);
  const anyJargon = sigs.some((s) => s.jargon.length);
  const anyGeneric = sigs.some((s) => s.generic.length);
  const greetRate = sigs.filter((s) => s.hasGreeting).length / n;
  const askRate = sigs.filter((s) => s.hasAsk).length / n;
  const avgScore = Math.round(reviews.reduce((t, r) => t + r.overall, 0) / (reviews.length || 1));

  // DON'Ts: the most common fixes across every critique, ranked by frequency + severity.
  const sevWeight: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
  const fixTally = new Map<string, { n: number; w: number; text: string }>();
  for (const r of reviews)
    for (const c of r.critiques)
      for (const f of c.fixes) {
        const key = f.text.replace(/"[^"]*"/g, "").trim();
        const cur = fixTally.get(key) || { n: 0, w: 0, text: f.text };
        cur.n += 1;
        cur.w += sevWeight[f.severity];
        fixTally.set(key, cur);
      }
  const donts = [...fixTally.values()].sort((a, b) => b.w - a.w || b.n - a.n).slice(0, 5).map((x) => x.text);

  // DO's: reinforce what's already working across the samples.
  const dos: string[] = [];
  if (greetRate >= 0.5) dos.push("Open with a warm, personal greeting");
  if (avgWords <= 180) dos.push(`Keep it tight — your samples average ${Math.round(avgWords)} words; hold near 120–160`);
  else dos.push("Trim to 120–160 words — your samples run long");
  if (avgYou >= 1.8) dos.push("Keep the reader-first framing (high “you/your” density)");
  if (askRate >= 0.5) dos.push("End with one clear, low-friction next step");
  dos.push("Ground personalization in the reader's actual behavior, not generic praise");

  const donts2 = donts.length
    ? donts
    : [
        anySpam ? "Salesy or spam-trigger phrasing" : "Hype and exaggeration",
        anyJargon ? "Corporate jargon" : "Multiple competing calls to action",
        anyGeneric ? "Generic, one-size-fits-all filler" : "Long, dense paragraphs",
      ];

  const voice =
    anySpam || anyJargon
      ? "Warm, concrete, peer-to-peer — dial down the salesy/corporate edges the samples show."
      : "Warm, concrete, peer-to-peer and non-salesy — consistent with the stronger samples.";

  const subjectTips = [
    avgSubject > 8 ? `Subjects average ${Math.round(avgSubject)} words — tighten toward ~6 so they don't truncate` : "Keep subjects short (~6 words) and specific",
    "Reference the reader's interest, not the sender",
  ];

  const structure = [
    "Greeting → one specific reference → one point of value → single next step → sign-off",
    avgWords > 200 ? "Break the body into 2–3 short paragraphs" : "Hold to 2–3 short paragraphs",
  ];

  return {
    voice,
    dos: dos.slice(0, 5),
    donts: donts2.slice(0, 5),
    structure,
    subjectTips,
    emailsReviewed: emails.length,
    avgScore,
  };
}

// A descriptive, portfolio-level read across every reviewed email (distinct
// from the prescriptive baseline). Computed from the reviews alone.
export interface AgentAvg {
  agentId: string;
  agentName: string;
  avg: number;
}
export interface IssueTally {
  text: string;
  count: number; // how many emails hit this issue
  severity: Severity;
}
export interface ReviewSummary {
  emails: number;
  avgScore: number;
  headline: string;
  perAgent: AgentAvg[]; // strongest → weakest
  strongest: AgentAvg;
  weakest: AgentAvg;
  best: { label: string; score: number };
  worst: { label: string; score: number };
  topIssues: IssueTally[];
  severityCounts: { high: number; medium: number; low: number };
}

export function summarizeReviews(reviews: EmailReview[]): ReviewSummary | null {
  if (!reviews.length) return null;
  const emails = reviews.length;
  const avgScore = Math.round(reviews.reduce((t, r) => t + r.overall, 0) / emails);

  // Per-agent averages across all emails.
  const agg = new Map<string, { name: string; total: number; n: number }>();
  for (const r of reviews)
    for (const c of r.critiques) {
      const cur = agg.get(c.agentId) || { name: c.agentName, total: 0, n: 0 };
      cur.total += c.score;
      cur.n += 1;
      agg.set(c.agentId, cur);
    }
  const perAgent: AgentAvg[] = [...agg.entries()]
    .map(([agentId, v]) => ({ agentId, agentName: v.name, avg: Math.round(v.total / Math.max(1, v.n)) }))
    .sort((a, b) => b.avg - a.avg);
  const strongest = perAgent[0];
  const weakest = perAgent[perAgent.length - 1];

  // Best / worst email by overall score.
  const byScore = [...reviews].sort((a, b) => b.overall - a.overall);
  const best = { label: byScore[0].label, score: byScore[0].overall };
  const worst = { label: byScore[byScore.length - 1].label, score: byScore[byScore.length - 1].overall };

  // Most common issues (by how many emails hit each), keeping the worst severity seen.
  const sevRank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
  const issues = new Map<string, { text: string; count: number; severity: Severity }>();
  const severityCounts = { high: 0, medium: 0, low: 0 };
  for (const r of reviews) {
    const seenInEmail = new Set<string>();
    for (const c of r.critiques)
      for (const f of c.fixes) {
        severityCounts[f.severity] += 1;
        const key = f.text.replace(/"[^"]*"/g, "").replace(/\d+/g, "").trim().toLowerCase();
        if (seenInEmail.has(key)) continue; // count each issue once per email
        seenInEmail.add(key);
        const cur = issues.get(key) || { text: f.text, count: 0, severity: f.severity };
        cur.count += 1;
        if (sevRank[f.severity] > sevRank[cur.severity]) cur.severity = f.severity;
        issues.set(key, cur);
      }
  }
  const topIssues = [...issues.values()]
    .sort((a, b) => b.count - a.count || sevRank[b.severity] - sevRank[a.severity])
    .slice(0, 6);

  const strong = perAgent.length > 1 ? ` Strongest on ${strongest.agentName}, weakest on ${weakest.agentName}.` : "";
  const lead = topIssues[0] ? ` Most common issue: ${topIssues[0].text.replace(/\s+—.*$/, "").replace(/\.$/, "")} (${topIssues[0].count} of ${emails}).` : "";
  const headline = `${emails} email${emails === 1 ? "" : "s"} reviewed, averaging ${avgScore}/100.${strong}${lead}`;

  return { emails, avgScore, headline, perAgent, strongest, weakest, best, worst, topIssues, severityCounts };
}

// Compact text form of the baseline, for injecting into the drafting prompt.
export function baselineToPrompt(b: EmailBaseline): string {
  return [
    `VOICE: ${b.voice}`,
    `DO: ${b.dos.join("; ")}`,
    `DON'T: ${b.donts.join("; ")}`,
    `STRUCTURE: ${b.structure.join("; ")}`,
    `SUBJECT: ${b.subjectTips.join("; ")}`,
  ].join("\n");
}
