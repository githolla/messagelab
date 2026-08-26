// Family D — structural defect critics (D49–D67; D68 needs the PDF artifact).
// Every function is pure and deterministic. Tuning lessons are baked in:
// years are not quantities, ranges are not contradictions, rate columns do not
// sum, capability claims need a first-person subject AND a deliverable noun,
// requirements hide in bullet runs, and titles must be NEAR names (260 chars).

import type { GateContext, GateFinding, GateExample } from "./model";
import { checkMeta } from "./model";
import type { ParsedDoc, GateSentence } from "./parse";
import { splitSentences } from "./parse";

const STOP = new Set("the a an and or of to in for with on by at from as is are be will was were this that these those it its our your their his her".split(" "));

export function contentWords(t: string, minLen = 4): string[] {
  return (t.toLowerCase().match(/[a-z][a-z'-]+/g) || []).filter((w) => w.length >= minLen && !STOP.has(w));
}

function ex(section: string, quote: string): GateExample {
  return { section, quote: quote.length > 150 ? quote.slice(0, 147) + "…" : quote };
}

function finding(
  id: string,
  verdict: GateFinding["verdict"],
  count: number,
  summary: string,
  examples: GateExample[] = [],
): GateFinding {
  const meta = checkMeta(id);
  return { id, name: meta.name, verdict, blocking: verdict === "deficiency" && meta.blocking, count, summary, examples: examples.slice(0, 6) };
}

const YEAR = /^(19|20)\d{2}$/;
function isYearToken(tok: string): boolean {
  return YEAR.test(tok.replace(/[^\d]/g, ""));
}
function numbersIn(t: string): number[] {
  return (t.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || [])
    .filter((tok) => !isYearToken(tok))
    .map((tok) => parseFloat(tok.replace(/[$,%]/g, "")))
    .filter((n) => Number.isFinite(n));
}

function per1k(count: number, words: number): number {
  return count / Math.max(words / 1000, 0.001);
}
function r1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

// ---- D49 · compliance gaps ------------------------------------------------

interface Requirement { text: string; ref: string }

/** shall/must/required sentences, plus bullets under a "must include:" lead-in
 * (the RFP's bullets carry no modal verb — the lead-in state does). */
export function extractRequirements(rfp: ParsedDoc): Requirement[] {
  const out: Requirement[] = [];
  const MODAL = /\b(shall|must|is required|are required|will be required|required to|are encouraged to|is encouraged to|expected to)\b/i;
  for (const s of rfp.sentences) {
    if (MODAL.test(s.text) && !/:\s*$/.test(s.text)) out.push({ text: s.text, ref: s.section });
  }
  const LEAD = /\b(must include|shall include|should include|are encouraged to include|to include the following|include the following)\b.*:\s*$/i;
  const lines = rfp.raw.replace(/\r\n?/g, "\n").split("\n");
  let inRun = false;
  let ref = "";
  for (const line of lines) {
    const t = line.trim();
    if (LEAD.test(t)) { inRun = true; ref = t.slice(0, 60); continue; }
    if (inRun) {
      const m = t.match(/^(?:[-*•·]|\d+[.)])\s+(.{4,})$/);
      if (m) out.push({ text: m[1], ref: `bullet under “${ref}”` });
      else if (!t) continue; // blank inside a run is tolerated once
      else inRun = false;
    }
  }
  // Dedupe on normalized text.
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = r.text.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function d49(doc: ParsedDoc, rfp: ParsedDoc | null): GateFinding {
  if (!rfp || !rfp.raw.trim()) return finding("D49", "skipped", -1, "Needs the RFP text to map requirements against.");
  // Submission mechanics ("submit by September 15") are procurement logistics —
  // they can't be covered by proposal prose, so scoring them is a false positive.
  const MECHANICS = /\b(submit(?:ted)?\s+(?:by|to|via|no later)|due\s+(?:by|date)|deadline|no later than|in (?:pdf|word) format|page limit)\b/i;
  const reqs = extractRequirements(rfp).filter((r) => !MECHANICS.test(r.text));
  if (!reqs.length) return finding("D49", "pass", 0, "No modal requirements detected in the RFP (parser may have under-read — 0 extracted).");
  const body = doc.raw.toLowerCase();
  const weak = reqs.filter((r) => {
    const terms = [...new Set(contentWords(r.text))].filter((w) => !/^(shall|must|required|include|following|vendor|vendors|proposal|proposals|encouraged|expected)$/.test(w));
    if (!terms.length) return false;
    const hit = terms.filter((w) => body.includes(w)).length;
    return hit / terms.length < 0.4 || hit < 2;
  });
  if (!weak.length) return finding("D49", "pass", 0, `0 of ${reqs.length} RFP requirements have weak or no coverage.`);
  return finding("D49", "deficiency", weak.length, `${weak.length} of ${reqs.length} RFP requirements have weak or no coverage.`,
    weak.map((r) => ex(r.ref, r.text)));
}

// ---- D50 · prescribed format ---------------------------------------------

/** Mine prescribed columns from RFP lines like "…a table with the following
 * columns: A, B, C" unless the context supplies them directly. */
export function minedColumns(rfp: ParsedDoc | null, ctx: GateContext): string[] {
  if (ctx.requiredColumns?.length) return ctx.requiredColumns;
  if (!rfp) return [];
  const m = rfp.raw.match(/columns?\s*(?:of|:)\s*([^\n.]{4,160})/i);
  if (!m) return [];
  return m[1].split(/,|;| and /i).map((c) => c.trim().replace(/^and\s+/i, "")).filter((c) => c && c.length <= 40);
}

export function d50(doc: ParsedDoc, rfp: ParsedDoc | null, ctx: GateContext): GateFinding {
  const cols = minedColumns(rfp, ctx);
  if (!cols.length) return finding("D50", "pass", 0, "No prescribed format detected in the RFP or context.");
  const headers = doc.tables.flatMap((t) => t.header.map((h) => h.toLowerCase()));
  const missing = cols.filter((c) => !headers.some((h) => h.includes(c.toLowerCase())));
  if (!missing.length) return finding("D50", "pass", 0, `0 prescribed-format deviations (${cols.length} required columns all present).`);
  return finding("D50", "deficiency", missing.length, `${missing.length} prescribed-format deviations.`,
    missing.map((c) => ex("(cost table)", `missing prescribed column: ${c}`)));
}

// ---- D51 · bare features --------------------------------------------------

const CAP_VERB = /\b(build|builds|provide|provides|deliver|delivers|manage|manages|create|creates|develop|develops|design|designs|execute|executes|integrate|integrates|produce|produces|run|runs|implement|implements|offer|offers|handle|handles)\b/i;
const DELIVERABLE = /\b(strateg(y|ies)|program|campaign|report(s|ing)?|plan|dashboard|package|creative|track(s)?|audience(s)?|segment(s|ation)?|model(s|ing)?|system|process|calendar|analysis|insight(s)?|channel(s)?|media|appeal(s)?|mailing(s)?|list(s)?)\b/i;
const BENEFIT = /\b(so that|so you|which means|meaning (you|your)|helping (you|your)|enabling (you|your)|resulting in|so your|frees (you|your)|to (grow|increase|reduce|protect|retain) your)\b/i;

function agencySubject(s: string, agency: string[]): boolean {
  const head = s.split(/\s+/).slice(0, 4).join(" ");
  return agency.some((a) => new RegExp(`(^|\\W)${a}\\b`, "i").test(head));
}

export function d51(doc: ParsedDoc, ctx: GateContext): GateFinding {
  const agency = ctx.agencyNames?.length ? ctx.agencyNames : ["We", "Our"];
  const claims = doc.sentences.filter((s) => agencySubject(s.text, agency) && CAP_VERB.test(s.text) && DELIVERABLE.test(s.text));
  if (!claims.length) return finding("D51", "pass", 0, "0 capability claims detected — nothing to anchor.");
  const bare = claims.filter((s) => !BENEFIT.test(s.text) && !/\d|\$|%/.test(s.text)
    && !(ctx.citedCaseStudies || []).some((c) => s.text.includes(c.name)));
  const pct = Math.round((bare.length / claims.length) * 100);
  const summary = `${bare.length} of ${claims.length} capability claims carry neither a benefit clause nor a proof anchor (${pct}%).`;
  if (!bare.length || pct < 50) return finding("D51", "pass", bare.length, summary);
  return finding("D51", "weakness", bare.length, summary, bare.map((s) => ex(s.section, s.text)));
}

// ---- D52 · unsourced claims ----------------------------------------------

const SOURCE_MARK = /\b(source|according to|per\s+[A-Z]|reported by|study|benchmark|based on|cite[ds]?|†|\[\d+\]|Appendix [A-Z])\b/i;

export function d52(doc: ParsedDoc, ctx: GateContext): GateFinding {
  const srcNames = (ctx.sources || []).map((s) => s.name.toLowerCase());
  const quantified = doc.sentences.filter((s) => numbersIn(s.text).length > 0 && !/\[|XX/.test(s.text));
  if (!quantified.length) return finding("D52", "pass", 0, "0 quantified sentences — nothing to source.");
  const unsourced = quantified.filter((s) => {
    if (SOURCE_MARK.test(s.text)) return false;
    const low = s.text.toLowerCase();
    return !srcNames.some((n) => low.includes(n));
  });
  const summary = `${unsourced.length} of ${quantified.length} quantified sentences carry no source marker.`;
  if (!unsourced.length) return finding("D52", "pass", 0, summary);
  return finding("D52", "weakness", unsourced.length, summary, unsourced.map((s) => ex(s.section, s.text)));
}

// ---- D53 · advantage constructions ---------------------------------------

export function d53(doc: ParsedDoc): GateFinding {
  const NEED = /\b(need|goal|objective|priorit|you told us|the rfp|your team asked|challenge you)\b/i;
  const hits = doc.sentences.filter((s) => /\b(can|could|may|might)\s+help\b/i.test(s.text) && !NEED.test(s.text));
  if (!hits.length) return finding("D53", "pass", 0, "0 advantage constructions with no stated need behind them.");
  return finding("D53", "weakness", hits.length, `${hits.length} advantage constructions with no stated need behind them.`,
    hits.map((s) => ex(s.section, s.text)));
}

// ---- D54 · rhetorical questions ------------------------------------------

export function d54(doc: ParsedDoc): GateFinding {
  const qs = doc.sentences.filter((s) => /\?$/.test(s.text.trim()));
  const bySec = new Map<string, GateSentence[]>();
  for (const q of qs) bySec.set(q.section, [...(bySec.get(q.section) || []), q]);
  const over = [...bySec.entries()].filter(([, arr]) => arr.length > 1);
  const summary = `${qs.length} rhetorical questions; ${over.length} sections exceed the one-per-section rule.`;
  if (!over.length) return finding("D54", "pass", 0, summary);
  return finding("D54", "weakness", over.length, summary, over.flatMap(([, arr]) => arr.map((s) => ex(s.section, s.text))));
}

// ---- D55 · customer as subject -------------------------------------------

export function d55(doc: ParsedDoc, ctx: GateContext): GateFinding {
  const agency = ctx.agencyNames?.length ? ctx.agencyNames : ["We", "Our"];
  const client = ctx.clientNames?.length ? [...ctx.clientNames, "You", "Your"] : ["You", "Your"];
  const BENEFIT_VERB = /\b(will|gain|receive|grow|improve|increase|strengthen|see|get|keep|save|reach)\b/i;
  const benefit = doc.sentences.filter((s) => BENEFIT_VERB.test(s.text));
  const agencyFirst = benefit.filter((s) => agencySubject(s.text, agency));
  const clientFirst = benefit.filter((s) => agencySubject(s.text, client));
  const graded = agencyFirst.length + clientFirst.length;
  if (graded < 5) return finding("D55", "pass", 0, `Only ${graded} classifiable benefit sentences — too few to grade.`);
  const pct = Math.round((agencyFirst.length / graded) * 100);
  const summary = `${agencyFirst.length} benefit sentences lead with the agency, ${clientFirst.length} lead with the client (${pct}% agency-first).`;
  if (pct <= 60) return finding("D55", "pass", 0, summary);
  return finding("D55", "weakness", agencyFirst.length, summary, agencyFirst.map((s) => ex(s.section, s.text)));
}

// ---- D56 · cross-section contradictions ----------------------------------

const ANCHOR_LABEL = /\b(response rate|average gift|retention(?: rate)?|reactivation|roi|return per \$?1|cost per (?:donor|piece|dollar)|revenue|net (?:revenue|income)|volume|acquisition cost|open rate|click rate)\b/i;

export function d56(doc: ParsedDoc): GateFinding {
  const anchors = new Map<string, { value: number; section: string; quote: string }[]>();
  for (const s of doc.sentences) {
    const m = s.text.match(ANCHOR_LABEL);
    if (!m) continue;
    if (/\b(between|from)\b.*\b(to|and)\b|\d\s*[–-]\s*\$?\d/.test(s.text)) continue; // ranges are not contradictions
    const nums = numbersIn(s.text);
    if (nums.length !== 1) continue; // one anchor, one value — multi-number sentences are tables in prose
    const key = m[0].toLowerCase();
    anchors.set(key, [...(anchors.get(key) || []), { value: nums[0], section: s.section, quote: s.text }]);
  }
  const conflicts: GateExample[] = [];
  let n = 0;
  for (const [label, vals] of anchors) {
    const sections = new Set(vals.map((v) => v.section));
    if (sections.size < 2) continue; // a genuine contradiction appears in two different sections
    const distinct = [...new Set(vals.map((v) => v.value))];
    const spread = Math.max(...distinct) - Math.min(...distinct);
    if (distinct.length > 1 && spread / Math.max(...distinct) > 0.02) {
      n++;
      conflicts.push(ex(vals[0].section, `“${label}” carries ${distinct.join(" vs ")} across sections`));
    }
  }
  if (!n) return finding("D56", "pass", 0, "0 numeric anchors carry more than one value.");
  return finding("D56", "deficiency", n, `${n} numeric anchors carry more than one value across sections.`, conflicts);
}

// ---- D57 · recycled content ----------------------------------------------

export function d57(doc: ParsedDoc, ctx: GateContext): GateFinding {
  const examples: GateExample[] = [];
  let stale = 0;
  for (const term of ctx.staleTerms || []) {
    const count = (doc.raw.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")) || []).length;
    if (count > 0) { stale++; examples.push(ex("(document)", `stale term “${term}” × ${count}`)); }
  }
  // Near-duplicate paragraphs across sections (5-gram Jaccard).
  const paras = doc.paragraphs.filter((p) => p.words >= 30);
  const shingles = paras.map((p) => {
    const w = contentWords(p.text, 3);
    const set = new Set<string>();
    for (let i = 0; i + 5 <= w.length; i++) set.add(w.slice(i, i + 5).join(" "));
    return set;
  });
  let dups = 0;
  for (let i = 0; i < paras.length; i++) for (let j = i + 1; j < paras.length; j++) {
    if (paras[i].section === paras[j].section) continue;
    const a = shingles[i], b = shingles[j];
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const s of a) if (b.has(s)) inter++;
    if (inter / (a.size + b.size - inter) > 0.6) {
      dups++;
      examples.push(ex(paras[i].section, `near-duplicate of a passage in “${paras[j].section}”: ${paras[i].text.slice(0, 90)}`));
    }
  }
  const summary = `${stale} stale-term hits, ${dups} near-duplicate passages.`;
  if (!stale && !dups) return finding("D57", "pass", 0, summary);
  return finding("D57", "weakness", stale + dups, summary, examples);
}

// ---- D58 · keyword stuffing ----------------------------------------------

export function d58(doc: ParsedDoc): GateFinding {
  const words = doc.raw.toLowerCase().match(/[a-z][a-z'-]+/g) || [];
  const counts = new Map<string, number>();
  for (const n of [3, 4]) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (STOP.has(gram[0]) || STOP.has(gram[n - 1])) continue;
      const key = gram.join(" ");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const over: GateExample[] = [];
  const flagged = new Set<string>();
  for (const [phrase, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (c < 6 || per1k(c, doc.words) < 1.2) continue;
    if ([...flagged].some((f) => f.includes(phrase) || phrase.includes(f))) continue; // subsumed n-grams
    flagged.add(phrase);
    over.push(ex("(document)", `“${phrase}” × ${c} — ${r1(per1k(c, doc.words))} per 1k words reads as stuffing`));
  }
  if (!over.length) return finding("D58", "pass", 0, "0 phrases exceed the stuffing threshold.");
  return finding("D58", "weakness", over.length, `${over.length} phrases exceed the stuffing threshold.`, over);
}

// ---- D59 · hedging --------------------------------------------------------

export function d59(doc: ParsedDoc): GateFinding {
  const HEDGE = /\b(strive to|seek to|aim to|attempt to|hope to|endeavor to|we may|our team may|where possible|as feasible)\b/i;
  const hits = doc.sentences.filter((s) => HEDGE.test(s.text));
  const rate = per1k(hits.length, doc.words);
  const summary = `${hits.length} hedged commitments (${r1(rate)} per 1k words).`;
  if (hits.length <= 2 || rate <= 1) return finding("D59", "pass", hits.length, summary, hits.slice(0, 2).map((s) => ex(s.section, s.text)));
  return finding("D59", "weakness", hits.length, summary, hits.map((s) => ex(s.section, s.text)));
}

// ---- D60 · weasel words ---------------------------------------------------

export function d60(doc: ParsedDoc, ctx: GateContext): GateFinding {
  const WEASEL = /\b(world-class|best-in-class|industry-leading|leading|cutting-edge|state-of-the-art|innovative|unparalleled|passionate|proven|premier|renowned)\b/i;
  const cases = (ctx.citedCaseStudies || []).map((c) => c.name);
  const hits = doc.sentences.filter((s) => WEASEL.test(s.text) && !/\d|\$|%/.test(s.text) && !cases.some((c) => s.text.includes(c)));
  const rate = per1k(hits.length, doc.words);
  const summary = `${hits.length} unsubstantiated superlatives (${r1(rate)} per 1k words).`;
  if (hits.length <= 2 || rate <= 1) return finding("D60", "pass", hits.length, summary, hits.slice(0, 2).map((s) => ex(s.section, s.text)));
  return finding("D60", "weakness", hits.length, summary, hits.map((s) => ex(s.section, s.text)));
}

// ---- D61 · placeholders ---------------------------------------------------

export function d61(doc: ParsedDoc): GateFinding {
  const PATTERNS: RegExp[] = [
    /\$\s?X{1,3}(?:[.,]X{2,3})*/g, // $XX,XXX
    /\[(?!\d)[^\]\n]{0,50}\](?!\()/g, // [brackets], but not markdown links or [1] citations
    /\bTBD\b|\bTK\b|\bTODO\b/g,
    /lorem ipsum/gi,
    /\bX{3,}\b/g,
    /«[^»\n]*»|\{\{[^}\n]*\}\}/g,
    /_{4,}/g,
  ];
  const examples: GateExample[] = [];
  let n = 0;
  for (const s of doc.sentences.concat(doc.tables.flatMap((t) => t.rows.map((r) => ({ text: r.join(" · "), section: t.section }))))) {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      const hits = s.text.match(re);
      if (hits) for (const h of hits) { n++; examples.push(ex(s.section, `${h} — in: ${s.text.slice(0, 90)}`)); }
    }
  }
  if (!n) return finding("D61", "pass", 0, "0 unresolved placeholders.");
  return finding("D61", "deficiency", n, `${n} unresolved placeholders. Nothing ships with one open.`, examples);
}

// ---- D62 · money consistency ---------------------------------------------

export function d62(doc: ParsedDoc): GateFinding {
  // Label = up to four content words before a money figure. Same label,
  // different amount, different sections → discrepancy. Ranges excluded.
  const seen = new Map<string, { value: number; section: string; quote: string }[]>();
  for (const s of doc.sentences) {
    if (/\d\s*[–-]\s*\$?\d|\bbetween\b/.test(s.text)) continue;
    const re = /((?:[a-z'-]+\s+){1,4})\$([\d,]+(?:\.\d+)?)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.text))) {
      const label = contentWords(m[1]).join(" ");
      if (!label) continue;
      const value = parseFloat(m[2].replace(/,/g, ""));
      seen.set(label, [...(seen.get(label) || []), { value, section: s.section, quote: s.text }]);
    }
  }
  const out: GateExample[] = [];
  let n = 0;
  for (const [label, vals] of seen) {
    if (new Set(vals.map((v) => v.section)).size < 2) continue;
    const distinct = [...new Set(vals.map((v) => v.value))];
    if (distinct.length > 1) { n++; out.push(ex(vals[0].section, `“${label}” stated as ${distinct.map((d) => `$${d.toLocaleString()}`).join(" and ")}`)); }
  }
  if (!n) return finding("D62", "pass", 0, "0 money figures stated more than one way under the same label.");
  return finding("D62", "deficiency", n, `${n} money figures stated more than one way under the same label.`, out);
}

// ---- D63 · arithmetic -----------------------------------------------------

const RATE_HEADER = /%|rate|per\b|roi|return|avg|average|ratio|\$\/|cost per|response/i;

function cellNumber(c: string): number | null {
  const t = c.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?%?$/.test(t)) return null;
  return parseFloat(t.replace("%", ""));
}

export function d63(doc: ParsedDoc): GateFinding {
  const out: GateExample[] = [];
  let checked = 0;
  let bad = 0;
  for (const table of doc.tables) {
    const totalRow = table.rows.find((r) => /total/i.test(r[0] || ""));
    if (!totalRow) continue;
    const dataRows = table.rows.filter((r) => r !== totalRow);
    for (let c = 1; c < table.header.length; c++) {
      const header = table.header[c] || "";
      if (RATE_HEADER.test(header)) continue; // rates do not sum
      const nums = dataRows.map((r) => cellNumber(r[c] ?? "")).filter((v): v is number => v !== null);
      const total = cellNumber(totalRow[c] ?? "");
      if (nums.length < 2 || total === null) continue;
      checked++;
      const sum = nums.reduce((t, v) => t + v, 0);
      if (Math.abs(sum - total) > Math.max(1, Math.abs(total) * 0.005)) {
        bad++;
        out.push(ex(table.section, `column “${header}” sums to ${sum.toLocaleString()} but the total row says ${total.toLocaleString()}`));
      }
    }
  }
  if (!bad) return finding("D63", "pass", 0, `0 table totals do not reconcile (${checked} checked).`);
  return finding("D63", "deficiency", bad, `${bad} table totals do not reconcile (${checked} checked).`, out);
}

// ---- D64 · dates ----------------------------------------------------------

const MONTHS = "january february march april may june july august september october november december".split(" ");

function parseDates(t: string): { d: Date; raw: string }[] {
  const out: { d: Date; raw: string }[] = [];
  const re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b|\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let d: Date | null = null;
    if (m[1]) {
      const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      d = new Date(y, parseInt(m[1]) - 1, parseInt(m[2]));
      if (d.getMonth() !== parseInt(m[1]) - 1 || d.getDate() !== parseInt(m[2])) { out.push({ d: new Date(NaN), raw: m[0] }); continue; }
    } else if (m[4]) {
      const monthTok = m[4].toLowerCase().replace(".", "");
      const mi = MONTHS.findIndex((mo) => mo.startsWith(monthTok));
      const y = m[6] ? parseInt(m[6]) : 2026;
      d = new Date(y, mi, parseInt(m[5]));
      if (d.getDate() !== parseInt(m[5])) { out.push({ d: new Date(NaN), raw: m[0] }); continue; }
    }
    if (d) out.push({ d, raw: m[0] });
  }
  return out;
}

export function d64(doc: ParsedDoc): GateFinding {
  const out: GateExample[] = [];
  let rows = 0;
  let bad = 0;
  for (const table of doc.tables) {
    const laterCols: number[] = [];
    const earlierCols: number[] = [];
    table.header.forEach((h, i) => {
      if (/in.home|deliver|due|complete/i.test(h)) laterCols.push(i);
      if (/mail date|drop|start|kickoff/i.test(h)) earlierCols.push(i);
    });
    for (const row of table.rows) {
      const dates = row.map((c) => parseDates(c)[0]).map((x) => x?.d);
      if (dates.filter(Boolean).length >= 1) rows++;
      for (const d of row.flatMap((c) => parseDates(c))) {
        if (isNaN(d.d.getTime())) { bad++; out.push(ex(table.section, `impossible date “${d.raw}” in row: ${row.join(" · ").slice(0, 80)}`)); }
      }
      for (const ec of earlierCols) for (const lc of laterCols) {
        const a = dates[ec], b = dates[lc];
        if (a && b && !isNaN(a.getTime()) && !isNaN(b.getTime()) && b < a) {
          bad++;
          out.push(ex(table.section, `“${table.header[lc]}” (${row[lc]}) precedes “${table.header[ec]}” (${row[ec]})`));
        }
      }
    }
  }
  if (!bad) return finding("D64", "pass", 0, `0 schedule conflicts across ${rows} dated rows.`);
  return finding("D64", "deficiency", bad, `${bad} schedule conflicts across ${rows} dated rows.`, out);
}

// ---- D65 · named people ---------------------------------------------------

export function d65(doc: ParsedDoc, ctx: GateContext): GateFinding {
  if (!ctx.people?.length) return finding("D65", "skipped", -1, "Needs `people` (name + correct title) in the context registry.");
  const out: GateExample[] = [];
  let n = 0;
  for (const person of ctx.people) {
    const idx = doc.raw.indexOf(person.name);
    if (idx < 0) continue; // not mentioned — nothing to validate
    // The actual question is proximity: title within 260 chars of the name.
    let ok = false;
    let at = idx;
    while (at >= 0) {
      const windowText = doc.raw.slice(Math.max(0, at - 260), at + person.name.length + 260).toLowerCase();
      if (windowText.includes(person.title.toLowerCase())) { ok = true; break; }
      at = doc.raw.indexOf(person.name, at + 1);
    }
    if (!ok) {
      n++;
      out.push(ex("(document)", `${person.name} appears without the correct title “${person.title}” anywhere nearby`));
    }
  }
  if (!n) return finding("D65", "pass", 0, "0 name or title problems.");
  return finding("D65", "deficiency", n, `${n} name or title problems.`, out);
}

// ---- D66 · terminology mirror --------------------------------------------

export function d66(doc: ParsedDoc, rfp: ParsedDoc | null): GateFinding {
  if (!rfp || !rfp.raw.trim()) return finding("D66", "skipped", -1, "Needs the RFP text to mirror terminology against.");
  const freq = new Map<string, number>();
  for (const w of contentWords(rfp.raw, 5)) freq.set(w, (freq.get(w) || 0) + 1);
  const body = doc.raw.toLowerCase();
  const missing = [...freq.entries()]
    .filter(([w, c]) => c >= 3 && !body.includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
  if (!missing.length) return finding("D66", "pass", 0, "0 terminology mismatches.");
  return finding("D66", "weakness", 1, "1 terminology mismatches.",
    [ex("(document)", `frequent RFP terms absent from the response: ${missing.join(", ")}`)]);
}

// ---- D67 · reading effort -------------------------------------------------

export function d67(doc: ParsedDoc): GateFinding {
  const n = doc.sentences.length || 1;
  const avgSentence = doc.sentences.reduce((t, s) => t + (s.text.match(/\S+/g) || []).length, 0) / n;
  const longParas = doc.paragraphs.filter((p) => p.words > 120).length;
  const index = Math.min(1, avgSentence / 40) * 0.6 + Math.min(1, longParas / 10) * 0.4;
  const examples = [
    ex("(document)", `avg sentence ${r1(avgSentence)} words`),
    ex("(document)", `${longParas} paragraphs over 120 words`),
    ex("(document)", `${doc.tables.length} tables`),
  ];
  const summary = `Effort index ${(Math.round(index * 100) / 100).toFixed(2)}. Higher is worse.`;
  if (index < 0.5) return finding("D67", "pass", 0, summary, examples);
  return finding("D67", "weakness", 1, summary, examples);
}

// ---- D68 · deliverable accessibility --------------------------------------

export function d68(): GateFinding {
  return finding("D68", "skipped", -1, "Needs the submitted PDF artifact — run it on the file, not the text.");
}
