// Conservative brand proofreader. Philosophy: the best editor knows which
// changes NOT to make. It auto-applies only objective corrections (spelling,
// typos, duplicate words, punctuation/spacing, excessive "!!!", promotional
// ALL-CAPS) while PROTECTING author voice, tone, CTAs, positioning, brand terms,
// acronyms, names, numbers, links and personalization tokens. Anything
// subjective (urgency/promo language, wordiness, long sentences, weak link text)
// is FLAGGED with a reason, never silently rewritten.
//
// Every change records Category + Confidence + a rule-tied reason. High/Medium
// confidence edits are applied; Low-confidence items are flagged only. Fully
// deterministic (no API key, no Math.random).

import type { PastEmail } from "./reviewers";

export type EditCategory =
  | "Spelling"
  | "Grammar"
  | "Punctuation"
  | "Readability"
  | "Clarity"
  | "Consistency"
  | "Brand"
  | "Deliverability";
export type Confidence = "High" | "Medium" | "Low";

export interface Change {
  before: string; // exact original text (may be "" for a general flag)
  after: string; // replacement ("" for removals / flags)
  category: EditCategory;
  confidence: Confidence;
  reason: string; // one concrete, rule-tied explanation
  count: number;
  applied: boolean; // whether the revised text reflects this change
  kind: "replace" | "flag";
}

export interface EmailRewrite {
  emailId: string;
  originalSubject: string;
  originalBody: string;
  revisedSubject: string;
  revisedBody: string;
  changes: Change[];
  appliedCount: number;
  flaggedCount: number;
  unchanged: boolean;
  summary: string;
}

// Protected acronyms / initialisms / titles — never case-normalized.
const ACRONYMS = new Set([
  "AGP", "AI", "CRM", "RFP", "KPI", "ROI", "PDF", "FAQ", "RSVP", "EOY", "USA", "URL",
  "CEO", "COO", "CFO", "CMO", "CTO", "CIO", "EVP", "SVP", "VP", "CX", "HR", "IT", "PR",
  "Q1", "Q2", "Q3", "Q4", "EIN", "DAF", "P2P", "SEO", "API", "SaaS", "B2B", "B2C",
]);

// Only these ALL-CAPS words read as promotional emphasis worth normalizing.
// Anything not here (a possible brand/product/term) is left untouched.
const PROMO_CAPS = new Set([
  "FREE", "REGISTER", "NOW", "SIGN", "UP", "HURRY", "TODAY", "LIMITED", "TIME",
  "ACT", "BUY", "SALE", "DEAL", "EXCLUSIVE", "AMAZING", "INCREDIBLE", "GUARANTEED",
  "MISS", "DON'T", "DON’T", "LAST", "CHANCE", "OFFER", "URGENT", "ENDS", "SOON",
  "CLICK", "HERE", "SAVE", "OUT", "BONUS", "WIN", "WINNER", "APPLY", "JOIN", "ORDER",
]);

// Common misspellings → correction (safe, unambiguous; no names/brands).
const MISSPELL: Array<[string, string]> = [
  ["foward", "forward"], ["recieve", "receive"], ["seperate", "separate"], ["definately", "definitely"],
  ["occured", "occurred"], ["occurence", "occurrence"], ["accomodate", "accommodate"], ["acheive", "achieve"],
  ["beleive", "believe"], ["calender", "calendar"], ["collegue", "colleague"], ["commited", "committed"],
  ["embarass", "embarrass"], ["enviroment", "environment"], ["existance", "existence"], ["familar", "familiar"],
  ["finaly", "finally"], ["goverment", "government"], ["greatful", "grateful"], ["happend", "happened"],
  ["immediatly", "immediately"], ["independant", "independent"], ["maintainance", "maintenance"],
  ["neccessary", "necessary"], ["noticable", "noticeable"], ["occassion", "occasion"], ["oppurtunity", "opportunity"],
  ["persistant", "persistent"], ["priviledge", "privilege"], ["publically", "publicly"], ["recomend", "recommend"],
  ["refered", "referred"], ["relevent", "relevant"], ["succesful", "successful"], ["successfull", "successful"],
  ["tommorow", "tomorrow"], ["untill", "until"], ["writting", "writing"], ["begining", "beginning"],
  ["occuring", "occurring"], ["alot", "a lot"], ["thier", "their"], ["teh", "the"], ["adn", "and"],
  ["jsut", "just"], ["becuase", "because"], ["wnat", "want"], ["taht", "that"], ["hte", "the"],
  ["wich", "which"], ["youre", "you're"], ["cant", "can't"], ["dont", "don't"], ["wont", "won't"],
];

// Grammar fixes with unambiguous corrections.
const GRAMMAR: Array<[RegExp, string, string]> = [
  [/\bcould of\b/gi, "could have", '"Could of" is a mishearing of "could have."'],
  [/\bwould of\b/gi, "would have", '"Would of" is a mishearing of "would have."'],
  [/\bshould of\b/gi, "should have", '"Should of" is a mishearing of "should have."'],
  [/\byour welcome\b/gi, "you're welcome", 'Contraction needed: "you\'re" = "you are."'],
];

// Urgency / promotional phrasing — FLAGGED, never auto-removed (positioning is
// a content decision, per the CTA / sales-positioning rules).
const URGENCY = ["act now", "limited time", "don't miss", "offer expires", "buy now", "risk-free", "100% risk-free", "exclusive deal", "last chance", "hurry", "once in a lifetime", "don't wait"];
// Classic wordiness — flagged as an optional tighten, not auto-applied.
const WORDY: Array<[string, string]> = [
  ["at this point in time", "now"],
  ["the reason is because", "because"],
  ["in the event that", "if"],
  ["due to the fact that", "because"],
  ["in spite of the fact that", "although"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matchCase = (src: string, repl: string): string => {
  if (src === src.toUpperCase() && src !== src.toLowerCase()) return repl.toUpperCase();
  if (/^[A-Z]/.test(src)) return repl.charAt(0).toUpperCase() + repl.slice(1);
  return repl;
};

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/(^|[.!?]\s|\n)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase())
    .trim();
}

type Rec = (c: Omit<Change, "count">) => void;

function applyEdits(text: string, rec: Rec): string {
  let out = text;

  // Spelling.
  for (const [wrong, right] of MISSPELL) {
    out = out.replace(new RegExp(`\\b${esc(wrong)}\\b`, "gi"), (m) => {
      const after = matchCase(m, right);
      if (after === m) return m;
      rec({ before: m, after, category: "Spelling", confidence: "High", reason: `Misspelling — "${m}" should be "${after}".`, applied: true, kind: "replace" });
      return after;
    });
  }

  // Grammar.
  for (const [re, right, why] of GRAMMAR) {
    out = out.replace(re, (m) => {
      const after = matchCase(m, right);
      rec({ before: m, after, category: "Grammar", confidence: "High", reason: why, applied: true, kind: "replace" });
      return after;
    });
  }

  // Duplicate words (lowercase only, to protect proper nouns / names).
  out = out.replace(/\b([a-z]{1,15})\s+\1\b/gi, (m, w) => {
    if (/^[A-Z]/.test(m)) return m; // starts capitalized → likely intentional / a name
    if (["had", "that"].includes(w.toLowerCase())) return m; // legitimately repeatable
    rec({ before: m, after: w, category: "Grammar", confidence: "High", reason: `Duplicate word — "${w}" is repeated.`, applied: true, kind: "replace" });
    return w;
  });

  // Excessive exclamation runs → a single "!" (a lone "!" is left alone).
  out = out.replace(/!{2,}/g, () => {
    rec({ before: "!!", after: "!", category: "Punctuation", confidence: "Medium", reason: "Multiple exclamation points read as excessive intensity — one is enough. A single “!” is fine.", applied: true, kind: "replace" });
    return "!";
  });

  // Space before punctuation.
  out = out.replace(/ +([,;:!?])/g, (_m, p) => {
    rec({ before: ` ${p}`, after: p, category: "Punctuation", confidence: "High", reason: `Removed the space before "${p}".`, applied: true, kind: "replace" });
    return p;
  });
  // Missing space after a comma/semicolon.
  out = out.replace(/([,;])([A-Za-z])/g, (_m, p, c) => {
    rec({ before: `${p}${c}`, after: `${p} ${c}`, category: "Punctuation", confidence: "High", reason: `Added a space after "${p}".`, applied: true, kind: "replace" });
    return `${p} ${c}`;
  });

  // Promotional ALL-CAPS → sentence case (acronyms / unknown terms preserved).
  out = out.replace(/\b[A-Z][A-Z'’]{1,}\b/g, (m) => {
    const u = m.toUpperCase();
    if (ACRONYMS.has(u) || ACRONYMS.has(m)) return m; // protected acronym / title
    if (!PROMO_CAPS.has(u)) return m; // unknown ALL-CAPS could be a brand/term — leave it
    // Lowercase the whole token; tidy() re-capitalizes only true sentence starts.
    const after = m.toLowerCase();
    rec({ before: m, after, category: "Deliverability", confidence: "Medium", reason: `Promotional ALL-CAPS "${m}" set to normal case — shouting caps read as promotional. Acronyms and brand terms are preserved.`, applied: true, kind: "replace" });
    return after;
  });

  return tidy(out);
}

function scanFlags(subject: string, body: string, rec: Rec) {
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const flagPhrase = (phrase: string, category: EditCategory, reason: string) => {
    if (seen.has(phrase)) return;
    const idx = lower.indexOf(phrase);
    if (idx < 0) return;
    seen.add(phrase);
    const before = text.slice(idx, idx + phrase.length);
    rec({ before, after: "", category, confidence: "Low", reason, applied: false, kind: "flag" });
  };

  for (const p of URGENCY)
    flagPhrase(p, "Deliverability", `Urgency/promotional phrase "${p}" — repeated urgency language can hurt tone and deliverability. Left unchanged: softening it is your call.`);

  if (/\bclick here\b/i.test(text))
    flagPhrase("click here", "Deliverability", '"Click here" is vague, non-descriptive link text — consider describing the destination. The link itself is left unchanged.');

  for (const [phrase, shorter] of WORDY)
    flagPhrase(phrase, "Readability", `Wordy — "${phrase}" could tighten to "${shorter}" with no change in meaning. Left as-is; conversational phrasing may be intentional.`);

  // Multiple links / CTAs.
  const links = (text.match(/https?:\/\/|\bclick here\b/gi) || []).length;
  if (links > 2)
    rec({ before: "", after: "", category: "Deliverability", confidence: "Low", reason: `${links} links/CTAs — consider consolidating to one primary next step. Left unchanged: which CTA to keep is a content decision.`, applied: false, kind: "flag" });

  // Long sentences (readability only — never auto-split).
  const sentences = body.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const n = (s.match(/\S+/g) || []).length;
    if (n > 40) {
      rec({ before: "", after: "", category: "Readability", confidence: "Medium", reason: `A sentence runs about ${n} words — consider splitting it for readability. Not auto-split: rewording is your call.`, applied: false, kind: "flag" });
      break;
    }
  }

  // Overall exclamation intensity across the email.
  const bangs = (body.match(/!/g) || []).length;
  if (bangs >= 3)
    rec({ before: "", after: "", category: "Deliverability", confidence: "Low", reason: `${bangs} exclamation points across the email create high intensity — consider easing off. Individual "!"s are left as written.`, applied: false, kind: "flag" });
}

export function rewriteEmail(_agents: unknown, e: PastEmail): EmailRewrite {
  const map = new Map<string, Change>();
  const rec: Rec = (c) => {
    const key = `${c.kind}|${c.category}|${c.before.toLowerCase()}|${c.after.toLowerCase()}|${c.reason}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { ...c, count: 1 });
  };

  const revisedSubject = applyEdits(e.subject, rec);
  const revisedBody = applyEdits(e.body, rec);
  scanFlags(e.subject, e.body, rec);

  const confRank: Record<Confidence, number> = { High: 3, Medium: 2, Low: 1 };
  const changes = [...map.values()].sort(
    (a, b) => Number(b.applied) - Number(a.applied) || confRank[b.confidence] - confRank[a.confidence] || b.count - a.count,
  );
  const appliedCount = changes.filter((c) => c.applied).reduce((t, c) => t + c.count, 0);
  const flaggedCount = changes.filter((c) => !c.applied).length;

  const parts: string[] = [];
  if (appliedCount) parts.push(`${appliedCount} correction${appliedCount === 1 ? "" : "s"} applied`);
  if (flaggedCount) parts.push(`${flaggedCount} item${flaggedCount === 1 ? "" : "s"} flagged for review`);
  const summary = parts.length ? parts.join(" · ") : "No issues found — this email reads clean, so nothing was changed.";

  return {
    emailId: e.id,
    originalSubject: e.subject,
    originalBody: e.body,
    revisedSubject,
    revisedBody,
    changes,
    appliedCount,
    flaggedCount,
    unchanged: appliedCount === 0,
    summary,
  };
}

export function rewriteAll(agents: unknown, emails: PastEmail[]): EmailRewrite[] {
  return emails.map((e) => rewriteEmail(agents, e));
}
