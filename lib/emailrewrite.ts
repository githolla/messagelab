// Deterministic email rewriter. After the review runs, this proposes a revised
// version of each email and — crucially — records EVERY edit as a Change with a
// specific, word-level reason attributed to the reviewer agent that would flag
// it. No API key, no Math.random: the same email always yields the same rewrite,
// so the "why each word changed" notes are stable and inspectable.

import type { ReviewAgent, PastEmail, Severity } from "./reviewers";

export interface Change {
  before: string; // original text (empty for pure additions)
  after: string; // replacement (empty for pure removals)
  reason: string; // specific, word-level justification
  agent: string; // reviewer lens the change answers to
  severity: Severity;
  count: number; // how many times this exact edit was applied
  kind: "replace" | "remove" | "add" | "note";
}

export interface EmailRewrite {
  emailId: string;
  originalSubject: string;
  originalBody: string;
  revisedSubject: string;
  revisedBody: string;
  changes: Change[];
  summary: string;
}

type RepFn = (m: string) => string;
type ReasonFn = (m: string) => string;
interface Rule {
  re: RegExp;
  rep: string | RepFn;
  reason: string | ReasonFn;
  lens: string; // builtin agent id, for attribution
  fallback: string; // display name if that agent isn't in the panel
  sev: Severity;
  kind: "replace" | "remove";
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rule = (
  phrase: string,
  rep: string | RepFn,
  reason: string | ReasonFn,
  lens: string,
  fallback: string,
  sev: Severity,
): Rule => {
  // Only anchor \b where the phrase edge is a word char — otherwise "100%" or
  // "$5" never match (a non-word char has no boundary against a following space).
  const left = /^\w/.test(phrase) ? "\\b" : "";
  const right = /\w$/.test(phrase) ? "\\b" : "";
  return {
    re: new RegExp(`${left}${esc(phrase)}${right}`, "gi"),
    rep,
    reason,
    lens,
    fallback,
    sev,
    kind: typeof rep === "string" && rep.trim() === "" ? "remove" : "replace",
  };
};

// High-pressure / overpromise / spam-trigger phrasing.
const SPAM_RULES: Rule[] = [
  rule("act now", "", 'High-pressure phrase — manufactured urgency erodes trust in a relationship follow-up.', "convert", "Conversion", "medium"),
  rule("limited time", "", "Manufactured scarcity reads as a sales gimmick, not a peer note.", "convert", "Conversion", "medium"),
  rule("don't miss", "", "Fear-of-missing-out phrasing feels pushy in a follow-up.", "convert", "Conversion", "low"),
  rule("offer expires", "", "Deadline pressure undercuts a trusted-advisor tone.", "convert", "Conversion", "low"),
  rule("once in a lifetime", "", "Overstated urgency reads as hype.", "brand", "Brand Voice", "low"),
  rule("risk-free", "", 'Overpromise — "risk-free" is a classic spam trigger and rarely true.', "deliver", "Deliverability & Trust", "high"),
  rule("100% risk-free", "", 'Absolute overpromise ("100% risk-free") is a spam magnet — drop it.', "deliver", "Deliverability & Trust", "high"),
  rule("100%", "", 'Absolute claims ("100%") trip spam filters and strain credibility.', "deliver", "Deliverability & Trust", "medium"),
  rule("we guarantee", "", 'A guarantee you can\'t back is a spam trigger and overpromises.', "deliver", "Deliverability & Trust", "high"),
  rule("i guarantee", "", 'A guarantee you can\'t back is a spam trigger and overpromises.', "deliver", "Deliverability & Trust", "high"),
  rule("guaranteed", "", 'A guarantee you can\'t back is a spam trigger — drop it.', "deliver", "Deliverability & Trust", "high"),
  rule("guarantee", "", 'A guarantee you can\'t back is a spam trigger — drop it.', "deliver", "Deliverability & Trust", "high"),
  rule("exclusive deal", "", "Promo language belongs in a sales blast, not a personal note.", "brand", "Brand Voice", "medium"),
  rule("amazing", "", 'Hype adjective ("amazing") — let specifics carry the value instead.', "brand", "Brand Voice", "low"),
  rule("incredible", "", 'Hype adjective ("incredible") — show, don\'t tell.', "brand", "Brand Voice", "low"),
  rule("click here", "take a look", '"Click here" is a top spam trigger and hides the destination — describe the link.', "deliver", "Deliverability & Trust", "high"),
];

// Corporate jargon → plain language.
const JARGON_MAP: Array<[string, string]> = [
  ["utilize", "use"],
  ["leverage", "use"],
  ["synergy", "a strong fit"],
  ["circle back", "follow up"],
  ["touch base", "check in"],
  ["low-hanging fruit", "quick wins"],
  ["move the needle", "make a difference"],
  ["value-add", "benefit"],
  ["best-in-class", "strong"],
  ["cutting-edge", "modern"],
  ["seamless", "smooth"],
  ["robust", "solid"],
  ["holistic", "complete"],
  ["paradigm", "approach"],
  ["bandwidth", "time"],
  ["solutions", "help"],
];
const JARGON_RULES: Rule[] = JARGON_MAP.map(([from, to]) =>
  rule(
    from,
    to,
    (m) => `Corporate jargon — a plain word reads as more human than "${m}".`,
    "copy",
    "Copy & Clarity",
    "low",
  ),
);

// Generic, me-first filler → removed or personalized.
const GENERIC_RULES: Rule[] = [
  rule("we are excited", "", "Me-first filler — leads with the sender's feelings; reframe around the reader.", "empathy", "Empathy", "high"),
  rule("we're excited", "", "Me-first filler — leads with the sender's feelings; reframe around the reader.", "empathy", "Empathy", "high"),
  rule("hope this email finds you well", "", "Empty opener — say something specific to them instead.", "empathy", "Empathy", "medium"),
  rule("valued customer", "", "Generic label — use their name or a specific reference.", "empathy", "Empathy", "high"),
  rule("dear friend", "Hi there", "Generic salutation — personalize the greeting.", "empathy", "Empathy", "high"),
  rule("dear sir", "Hi there", "Impersonal salutation — personalize the greeting.", "empathy", "Empathy", "high"),
  rule("to whom it may concern", "Hi there", "Impersonal salutation — personalize the greeting.", "empathy", "Empathy", "high"),
  rule("at our organization", "", "Sender-focused filler — center the reader.", "empathy", "Empathy", "low"),
];

const ALL_RULES = [...SPAM_RULES, ...JARGON_RULES, ...GENERIC_RULES];

// Acronyms we should NOT lowercase when de-capitalizing shouting.
const ACRONYMS = new Set(["CEO", "CTO", "CFO", "COO", "USA", "FAQ", "PDF", "URL", "ROI", "KPI", "AGP", "RSVP", "EOY"]);
const ASK_RE = /\b(reply|schedule|book|grab|let me know|would you|are you open|can we|can you|join|register|download|call|meet|happy to|worth a)\b|\?/i;

function agentName(agents: ReviewAgent[], id: string, fallback: string): string {
  return agents.find((a) => a.id === id)?.name || fallback;
}

function record(map: Map<string, Change>, c: Omit<Change, "count">) {
  const key = `${c.kind}|${c.before.toLowerCase()}|${c.after.toLowerCase()}`;
  const cur = map.get(key);
  if (cur) cur.count += 1;
  else map.set(key, { ...c, count: 1 });
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n") // leading indentation left by a removed opener
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/([.,!?;:]){2,}/g, "$1")
    .replace(/(^|\n)\s*[—–-]\s+/g, "$1") // dangling dash at the start of a line
    .replace(/([.!?])\s+[—–-]\s+/g, "$1 ") // dangling dash after a removed clause
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase())
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function rewriteEmail(agents: ReviewAgent[], e: PastEmail): EmailRewrite {
  const changes = new Map<string, Change>();
  const apply = (text: string): string => {
    let out = text;
    for (const r of ALL_RULES) {
      out = out.replace(r.re, (m) => {
        const after = typeof r.rep === "function" ? r.rep(m) : r.rep;
        const reason = typeof r.reason === "function" ? r.reason(m) : r.reason;
        record(changes, { before: m, after, reason, agent: agentName(agents, r.lens, r.fallback), severity: r.sev, kind: r.kind });
        return after;
      });
    }
    // Collapse exclamation runs to a period.
    out = out.replace(/!+/g, (m) => {
      record(changes, { before: m, after: ".", reason: "Exclamation points read as promotional; a period sounds calmer and more credible.", agent: agentName(agents, "brand", "Brand Voice"), severity: "medium", kind: "replace" });
      return ".";
    });
    // De-shout ALL-CAPS words (keep known acronyms).
    out = out.replace(/\b[A-Z][A-Z'’]{2,}\b/g, (m) => {
      if (ACRONYMS.has(m.toUpperCase())) return m;
      const after = m.charAt(0) + m.slice(1).toLowerCase();
      record(changes, { before: m, after, reason: "ALL-CAPS trips spam filters and reads as shouting — normal case is calmer.", agent: agentName(agents, "deliver", "Deliverability & Trust"), severity: "medium", kind: "replace" });
      return after;
    });
    return out;
  };

  const revisedSubject = tidy(apply(e.subject));
  let revisedBody = tidy(apply(e.body));

  // Add a clear next step if the email has no ask at all.
  if (!ASK_RE.test(e.body)) {
    const ask = "Would a short call next week be useful?";
    revisedBody = revisedBody.replace(/\s*$/, "") + `\n\n${ask}`;
    record(changes, { before: "", after: ask, reason: "The email had no clear ask — added one low-friction next step so the reader knows what to do.", agent: agentName(agents, "convert", "Conversion"), severity: "high", kind: "add" });
  }

  // Structural notes we flag but don't auto-apply (they need a human rewrite).
  const words = (e.body.match(/\S+/g) || []).length;
  if (words > 220)
    record(changes, { before: "", after: "", reason: `At ${words} words this runs long — tighten to 120–160 so it stays skimmable.`, agent: agentName(agents, "copy", "Copy & Clarity"), severity: words > 320 ? "high" : "medium", kind: "note" });
  const firstLine = (e.body.trim().split(/\n/)[0] || "").replace(/^(hi|hello|dear|hey)[^,]*,?\s*/i, "");
  if (/^(i|we)\b/i.test(firstLine))
    record(changes, { before: "", after: "", reason: 'Opens with "I/We" — lead the first line with the reader, not the sender.', agent: agentName(agents, "copy", "Copy & Clarity"), severity: "medium", kind: "note" });

  const list = [...changes.values()].sort((a, b) => sev(b.severity) - sev(a.severity) || b.count - a.count);
  const edits = list.filter((c) => c.kind !== "note").reduce((t, c) => t + c.count, 0);
  const summary = edits
    ? `${edits} edit${edits === 1 ? "" : "s"} across ${list.length} issue${list.length === 1 ? "" : "s"} — see why each was changed below.`
    : "No wording changes suggested — this email already reads clean.";

  return {
    emailId: e.id,
    originalSubject: e.subject,
    originalBody: e.body,
    revisedSubject,
    revisedBody,
    changes: list,
    summary,
  };
}

const sev = (s: Severity) => (s === "high" ? 3 : s === "medium" ? 2 : 1);

export function rewriteAll(agents: ReviewAgent[], emails: PastEmail[]): EmailRewrite[] {
  return emails.map((e) => rewriteEmail(agents, e));
}
