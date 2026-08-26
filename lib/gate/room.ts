// The Committee Room — the LIVE half of the evaluator roster. The 22 family-A
// committee personas each read the proposal in character (honoring their
// visibility scopes: the CFO sees only the cost section, the reluctant
// conscript sees page one and the price), recalibrated by exactly one
// family-B subsector lens and one family-C buyer-state. Family-G meta critics
// run as a second wave on the whole document. The deterministic gate (D/F)
// runs first and its findings are handed to every persona as the mechanical
// pre-check. Demo path is deterministic (fnv1a) — no key, no Math.random.

import { fnv1a, fnv1aFloat, clamp } from "../util";
import type { Evaluator } from "./roster";
import { EVALUATORS, byFamily } from "./roster";
import type { ParsedDoc } from "./parse";
import type { GateRun } from "./model";

export type RoomStance = "champion" | "supportive" | "neutral" | "skeptical" | "opposed";
export const STANCES: RoomStance[] = ["champion", "supportive", "neutral", "skeptical", "opposed"];
export const STANCE_LABEL: Record<RoomStance, string> = {
  champion: "Champion", supportive: "Supportive", neutral: "On the fence", skeptical: "Skeptical", opposed: "Opposed",
};
export const STANCE_SCORE: Record<RoomStance, number> = { champion: 5, supportive: 4, neutral: 3, skeptical: 2, opposed: 1 };

export interface RoomReaction {
  evaluatorId: string;
  name: string;
  family: "A" | "G";
  scopeNote: string; // what this persona actually read
  score: number; // 0-5, their rubric read
  stance: RoomStance;
  veto: boolean; // screen-out roles only
  quote: string; // the sentence they'd say in the committee meeting
  strength: string;
  concern: string;
  question: string; // what they'd ask the agency
  recordable: string; // the line they'd write on a scoresheet
  model?: string;
  error?: string;
}

// ---- Visibility scopes ----------------------------------------------------
// Each A-persona is defined as much by what it refuses to read as by what it
// thinks. Sections are matched by title; personas with no matching section
// fall back to the opening of the document (which is itself realistic).

interface Scope {
  match?: RegExp; // section titles this persona reads
  whole?: boolean; // reads everything
  firstChars?: number; // additionally reads the top of the document
  note: string;
}

const SCOPES: Record<string, Scope> = {
  A01: { whole: true, note: "reads the whole document" },
  A02: { match: /exec|summary|cost|price|fee|invest|why|about (us|you)/i, note: "reads the executive summary, the price, and 'why you' — nothing else" },
  A03: { match: /cost|price|fee|budget|invest/i, note: "reads the cost section only" },
  A04: { match: /strateg|campaign|segment|timeline|calendar|audience|program|approach|test/i, note: "screens the mechanics — segmentation, packages, testing" },
  A05: { match: /data|crm|system|integrat|file|tech/i, note: "reads data integration and file handling" },
  A06: { match: /secur|privacy|data|subprocess|retention|breach|compliance/i, note: "reads security, subprocessors, retention, breach terms" },
  A07: { match: /brand|creative|design|approv|voice|communic/i, note: "reads brand control and approval workflow" },
  A08: { match: /exec|summary|cost|price|fee|invest/i, note: "reads the executive summary and the price" },
  A09: { match: /exec|summary|growth|strateg|acquisition/i, note: "reads the executive summary and the growth story" },
  A10: { match: /story|creative|mission|voice|culture|communit/i, note: "reads the storytelling sections for truthfulness" },
  A11: { whole: true, note: "scans the whole document for mandatory elements and disqualifiers" },
  A12: { match: /report|budget|cost|fund|grant/i, note: "reads reporting burden and restricted-fund implications" },
  A13: { match: /major|mid-level|pipeline|upgrade|donor journey/i, note: "reads pipeline handoff and mid-level" },
  A14: { match: /digital|email|online|channel|attribut|web/i, note: "reads channel integration and attribution" },
  A15: { match: /donor|experience|steward|acknowledg|engag/i, note: "reads the constituent experience end to end" },
  A16: { match: /term|contract|legal|indemn|ip|ownership|terminat/i, note: "reads indemnity, IP, data rights, termination" },
  A17: { whole: true, note: "reads everything, looking for a reason to stay with the incumbent" },
  A18: { match: /cost|price|fee/i, firstChars: 2200, note: "reads page one and the price — eight minutes, tops" },
  A19: { whole: true, note: "reads everything, pattern-matching against fifty other proposals" },
  A20: { match: /story|communit|voice|represent|consent|culture|equit/i, note: "reads representation, consent, whose voice carries the story" },
  A21: { match: /staff|team|timeline|onboard|capacity|hour|meeting/i, note: "reads staff burden and capacity" },
  A22: { match: /exec|summary|story|mission|voice|culture/i, note: "reads for voice and tone before numbers" },
};

const WHOLE_CAP = 14000;
const SCOPE_CAP = 9000;

export function visibleText(evaluatorId: string, doc: ParsedDoc): { text: string; note: string } {
  const scope = SCOPES[evaluatorId];
  if (!scope || scope.whole) {
    return { text: doc.raw.slice(0, WHOLE_CAP), note: scope?.note ?? "reads the whole document" };
  }
  const parts: string[] = [];
  if (scope.firstChars) parts.push(doc.raw.slice(0, scope.firstChars));
  for (const s of doc.sections) {
    if (scope.match && scope.match.test(s.title)) parts.push(`# ${s.title}\n${s.text.trim()}`);
  }
  // Tables render as prose for scoped readers whose section carries them.
  for (const t of doc.tables) {
    if (scope.match && scope.match.test(t.section)) {
      parts.push(`[table in ${t.section}]\n${t.header.join(" | ")}\n${t.rows.map((r) => r.join(" | ")).join("\n")}`);
    }
  }
  const text = parts.join("\n\n").slice(0, SCOPE_CAP);
  if (!text.trim()) {
    // Nothing in their lane — they skim the opening, which is what happens in real committees.
    return { text: doc.raw.slice(0, 2500), note: `${scope.note} — found no matching section, skimmed the opening instead` };
  }
  return { text, note: scope.note };
}

/** Screen-out roles that can veto but not approve. */
const VETO_IDS = new Set(["A04", "A05", "A06", "A11", "A16", "A22"]);
export function canVeto(id: string): boolean {
  return VETO_IDS.has(id);
}

export function committeeRoster(): Evaluator[] {
  return byFamily("A");
}
export function metaRoster(): Evaluator[] {
  return byFamily("G").filter((e) => e.id !== "G100"); // G100 is the deterministic submission gate — already run
}
export function lensOptions(): Evaluator[] {
  return byFamily("B");
}
export function buyerStateOptions(): Evaluator[] {
  return byFamily("C");
}

/** The gate's mechanical findings, compressed for a persona prompt. */
export function gateBriefing(run: GateRun | null): string {
  if (!run) return "The mechanical pre-check has not been run.";
  const open = run.findings.filter((f) => f.verdict === "deficiency" || f.verdict === "weakness");
  if (!open.length) return "The mechanical pre-check (30 deterministic checks) found nothing open.";
  const lines = open.slice(0, 8).map((f) => `- ${f.id} ${f.verdict}${f.blocking ? " (BLOCKING)" : ""}: ${f.summary}`);
  return `The mechanical pre-check found ${run.tally.deficiencies} deficiencies (${run.tally.blocking} blocking) and ${run.tally.weaknesses} weaknesses:\n${lines.join("\n")}`;
}

// ---- Deterministic demo ---------------------------------------------------

const Q_STRENGTH = [
  "the plan is specific enough to hold someone accountable to",
  "the cost section is comparable line by line",
  "it answers the requirement list in order instead of around it",
  "the timeline reads like someone has actually run this before",
  "the proof points are from organizations that look like us",
  "it commits to numbers a board can check later",
];
const Q_CONCERN = [
  "I can't tell who on our staff does what, or for how many hours",
  "the projections have no range around them",
  "it reads like it was written for a different organization first",
  "the price is clear but the value case for it is not",
  "there's no named person accountable on their side",
  "the references don't look like us",
];
const Q_QUESTION = [
  "Who exactly will be in the room with us each month?",
  "What happens in month one if the first drop underperforms?",
  "Which of these numbers would you put your fee at risk on?",
  "How much of our staff time does this actually require?",
  "What would make you tell us to spend less?",
  "Who owns the data and the creative when this ends?",
];
const Q_POS = [
  "This is the one I'd defend in the meeting.",
  "I could take this to the board without rehearsing.",
  "It answers the question we actually asked.",
];
const Q_NEU = [
  "It's competent. I'm not sure it's ours.",
  "Nothing disqualifying, nothing memorable.",
  "I'd want the finalists' interviews before deciding.",
];
const Q_NEG = [
  "I'd struggle to justify this one over the field.",
  "It lost me before it got to the part I care about.",
  "If this is their best reading of us, the fit isn't there.",
];

function pick(bank: string[], seed: string): string {
  return bank[fnv1a(seed) % bank.length];
}

export function demoReaction(ev: Evaluator, doc: ParsedDoc, gate: GateRun | null): RoomReaction {
  const docHash = fnv1a(doc.raw.slice(0, 3000)).toString(36);
  const seed = ev.id + docHash;
  // The room leans on the mechanical pass: open blocking defects drag everyone.
  const gatePenalty = gate ? Math.min(0.25, gate.tally.blocking * 0.06 + gate.tally.weaknesses * 0.015) : 0;
  const base = 0.62 - gatePenalty;
  const jit = (fnv1aFloat(seed) - 0.5) * 0.5;
  const x = clamp(base + jit, 0.05, 0.95);
  const score = Math.round(x * 10) / 2; // 0-5 in halves
  const stance: RoomStance = x > 0.78 ? "champion" : x > 0.6 ? "supportive" : x > 0.42 ? "neutral" : x > 0.28 ? "skeptical" : "opposed";
  const veto = canVeto(ev.id) && x < 0.22;
  const { note } = visibleText(ev.id, doc);
  const quoteBank = x > 0.6 ? Q_POS : x > 0.42 ? Q_NEU : Q_NEG;
  return {
    evaluatorId: ev.id,
    name: ev.name,
    family: ev.family === "G" ? "G" : "A",
    scopeNote: note,
    score,
    stance,
    veto,
    quote: pick(quoteBank, seed + "q"),
    strength: pick(Q_STRENGTH, seed + "s"),
    concern: pick(Q_CONCERN, seed + "c"),
    question: pick(Q_QUESTION, seed + "?"),
    recordable: `${STANCE_LABEL[stance]} at ${score.toFixed(1)}/5 — ${pick(x > 0.5 ? Q_STRENGTH : Q_CONCERN, seed + "r")}.`,
  };
}

// ---- Aggregation ----------------------------------------------------------

export type RoomVerdict = "select" | "front_runner" | "contender" | "long_shot" | "no_award";
export const ROOM_VERDICT_LABEL: Record<RoomVerdict, string> = {
  select: "Committee pick", front_runner: "Front-runner", contender: "Contender", long_shot: "Long shot", no_award: "No award",
};

export interface RoomSummary {
  n: number;
  avgScore: number;
  stanceDist: { key: RoomStance; count: number }[];
  vetoes: RoomReaction[];
  champions: RoomReaction[];
  verdict: RoomVerdict;
  headline: string;
  questions: string[]; // what you'll be asked in the room
}

export function summarizeRoom(reactions: RoomReaction[]): RoomSummary {
  const committee = reactions.filter((r) => r.family === "A");
  const n = committee.length || 1;
  const avgScore = committee.reduce((t, r) => t + r.score, 0) / n;
  const stanceDist = STANCES.map((k) => ({ key: k, count: committee.filter((r) => r.stance === k).length }));
  const vetoes = committee.filter((r) => r.veto);
  const champions = committee.filter((r) => r.stance === "champion");
  const positive = committee.filter((r) => r.stance === "champion" || r.stance === "supportive").length;

  let verdict: RoomVerdict =
    avgScore >= 4.1 && positive / n >= 0.6 ? "select"
      : avgScore >= 3.6 ? "front_runner"
        : avgScore >= 2.9 ? "contender"
          : avgScore >= 2.2 ? "long_shot"
            : "no_award";
  if (vetoes.length && (verdict === "select" || verdict === "front_runner")) verdict = "contender";

  const headline = vetoes.length
    ? `${vetoes.length} screen-out ${vetoes.length === 1 ? "role holds a veto" : "roles hold vetoes"} — ${vetoes.map((v) => v.name.split("/")[0].trim()).join(", ")}. Resolve ${vetoes.length === 1 ? "it" : "them"} before anything else matters.`
    : champions.length
      ? `${champions.length} of ${n} would champion it; the room averages ${avgScore.toFixed(1)}/5. The concerns below are what stands between this and a pick.`
      : `No one in the room would champion it yet — the average is ${avgScore.toFixed(1)}/5. The questions below are what the committee will actually ask.`;

  // The questions you'll face: dedupe, committee first.
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const r of [...committee, ...reactions.filter((r) => r.family === "G")]) {
    const q = (r.question || "").trim();
    const k = q.toLowerCase();
    if (q.length > 8 && !seen.has(k)) { seen.add(k); questions.push(q); }
    if (questions.length >= 8) break;
  }

  return { n: committee.length, avgScore, stanceDist, vetoes, champions, verdict, headline, questions };
}

export { EVALUATORS };
