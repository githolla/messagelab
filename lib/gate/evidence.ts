// Family F — evidence and numeric verifiers (F81–F90). These do not have
// opinions: they trace figures to the registry the context supplies and report
// what cannot be traced. Checks that need context they don't have report
// `skipped` with the missing key named.

import type { GateContext, GateFinding, GateExample, GateCaseStudy } from "./model";
import { checkMeta } from "./model";
import type { ParsedDoc } from "./parse";
import { contentWords } from "./checks";

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

// ---- F81 · provenance -----------------------------------------------------

const CITE_CUE = /(?:according to|per|source:|reported by|data from|from the)\s+((?:[A-Z][\w'&+-]*(?:\s|$)){1,6})/g;

export function f81(doc: ParsedDoc, ctx: GateContext): GateFinding {
  const registry = (ctx.sources || []).map((s) => s.name);
  let registered = 0;
  for (const name of registry) if (doc.raw.toLowerCase().includes(name.toLowerCase())) registered++;
  const unregistered: GateExample[] = [];
  for (const s of doc.sentences) {
    CITE_CUE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITE_CUE.exec(s.text))) {
      const name = m[1].trim().replace(/[.,;:]$/, "");
      if (name.split(/\s+/).length < 2) continue; // single capitalized words are too noisy
      if (!registry.some((r) => name.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(name.toLowerCase()))) {
        unregistered.push(ex(s.section, name));
      }
    }
  }
  const summary = `${registered} registered sources cited; ${unregistered.length} named sources not in the registry.`;
  if (!unregistered.length) return finding("F81", "pass", 0, summary);
  return finding("F81", "weakness", unregistered.length, summary, unregistered);
}

// ---- F82 · currency -------------------------------------------------------

export function f82(doc: ParsedDoc, ctx: GateContext, nowYear: number): GateFinding {
  if (!ctx.sources?.length) return finding("F82", "skipped", -1, "Needs `sources` (name, year, maxAgeYears) in the context registry.");
  const stale: GateExample[] = [];
  for (const s of ctx.sources) {
    if (!s.year || !doc.raw.toLowerCase().includes(s.name.toLowerCase())) continue;
    const maxAge = s.maxAgeYears ?? 3;
    if (nowYear - s.year > maxAge) stale.push(ex("(registry)", `${s.name} (${s.year}) exceeds its acceptable age of ${maxAge} years`));
  }
  if (!stale.length) return finding("F82", "pass", 0, "0 cited sources exceed their acceptable age.");
  return finding("F82", "weakness", stale.length, `${stale.length} cited sources exceed their acceptable age.`, stale);
}

// ---- F83 · model reconciliation ------------------------------------------

export function f83(doc: ParsedDoc, ctx: GateContext): GateFinding {
  if (!ctx.publishedAggregates?.length) return finding("F83", "skipped", -1, "Needs `publishedAggregates` (label, value, tolerancePct) in the context registry.");
  const out: GateExample[] = [];
  let outside = 0;
  let checked = 0;
  for (const agg of ctx.publishedAggregates) {
    const terms = contentWords(agg.label);
    const hit = doc.sentences.find((s) => {
      const low = s.text.toLowerCase();
      return terms.every((t) => low.includes(t)) && /\d/.test(s.text);
    });
    if (!hit) continue;
    const nums = (hit.text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => parseFloat(n.replace(/,/g, "")));
    // Take the number nearest the published value as the derived one.
    const derived = nums.sort((a, b) => Math.abs(a - agg.value) - Math.abs(b - agg.value))[0];
    if (derived === undefined) continue;
    checked++;
    const variance = agg.value ? Math.abs(derived - agg.value) / Math.abs(agg.value) : 0;
    const tol = (agg.tolerancePct ?? 10) / 100;
    const line = `${agg.label}: derived ${derived} vs published ${agg.value} (${variance > 0 ? "+" : ""}${Math.round(variance * 100)}% variance)`;
    if (variance > tol) { outside++; out.push(ex(hit.section, line)); }
    else out.push(ex(hit.section, line));
  }
  const summary = `${outside} of ${checked} model outputs fall outside tolerance against published aggregates.`;
  if (!outside) return finding("F83", "pass", 0, summary, out);
  return finding("F83", "weakness", outside, summary, out);
}

// ---- F84 · assumption completeness ---------------------------------------

export function f84(ctx: GateContext): GateFinding {
  if (!ctx.modelInputs?.length) return finding("F84", "skipped", -1, "Needs `modelInputs` (name, source, consequence) in the context registry.");
  const bad = ctx.modelInputs.filter((i) => !i.source?.trim() || !i.consequence?.trim());
  const summary = `${bad.length} of ${ctx.modelInputs.length} model inputs are unregistered or lack a consequence-if-wrong.`;
  if (!bad.length) return finding("F84", "pass", 0, summary);
  return finding("F84", "weakness", bad.length, summary,
    bad.map((i) => ex("(registry)", `${i.name}: ${!i.source?.trim() ? "no source" : ""}${!i.source?.trim() && !i.consequence?.trim() ? ", " : ""}${!i.consequence?.trim() ? "no consequence-if-wrong" : ""}`)));
}

// ---- F85 · proof match ----------------------------------------------------

const DIMS: { key: string; get: (c: GateCaseStudy) => string | string[] | undefined }[] = [
  { key: "subsector", get: (c) => c.subsector },
  { key: "budget band", get: (c) => c.budgetBand },
  { key: "file size", get: (c) => c.fileSize },
  { key: "region", get: (c) => c.region },
  { key: "org type", get: (c) => c.orgType },
  { key: "toolset", get: (c) => c.toolset },
  { key: "channel", get: (c) => c.channels },
];

function dimMatch(a?: string | string[], b?: string | string[]): boolean {
  if (!a || !b) return false;
  const A = (Array.isArray(a) ? a : [a]).map((x) => x.toLowerCase());
  const B = (Array.isArray(b) ? b : [b]).map((x) => x.toLowerCase());
  return A.some((x) => B.includes(x));
}

export function f85(doc: ParsedDoc, ctx: GateContext): GateFinding {
  if (!ctx.client || !ctx.citedCaseStudies?.length) {
    return finding("F85", "skipped", -1, "Needs `client` and `citedCaseStudies` (dimension profiles) in the context registry.");
  }
  const cited = ctx.citedCaseStudies.filter((c) => doc.raw.toLowerCase().includes(c.name.toLowerCase()));
  if (!cited.length) return finding("F85", "pass", 0, "0 registered case studies are cited in the document.");
  const out: GateExample[] = [];
  let weakMatches = 0;
  for (const c of cited) {
    const matched = DIMS.filter((d) => dimMatch(d.get(c), d.get(ctx.client!)));
    const line = `${c.name}: match ${matched.length}/7${matched.length ? ` (${matched.map((d) => d.key).join(", ")})` : " — no dimension matches"}`;
    if (matched.length <= 1) weakMatches++;
    out.push(ex("(registry)", line));
  }
  const summary = `${weakMatches} of ${cited.length} cited proof points match the client on at most one dimension.`;
  if (!weakMatches) return finding("F85", "pass", 0, summary, out);
  return finding("F85", "weakness", weakMatches, summary, out);
}

// ---- F86 · reference relevance -------------------------------------------

/** Preference phrases mined from the RFP unless supplied: sentences with
 * prefer/similar/experience-with cues. */
export function minedPreferences(rfp: ParsedDoc | null, ctx: GateContext): string[] {
  if (ctx.rfpPreferences?.length) return ctx.rfpPreferences;
  if (!rfp) return [];
  return rfp.sentences
    .filter((s) => /\b(prefer|preference|similar (?:organizations?|institutions?|clients?)|experience (?:with|serving)|ideally)\b/i.test(s.text))
    .map((s) => s.text);
}

/** References the document itself offers: the context list, plus any registered
 * org named inside a References-titled section (so a rebuild that adds the
 * right reference clears the finding without editing the shared registry). */
function offeredReferences(doc: ParsedDoc, ctx: GateContext): string[] {
  const out = new Set(ctx.referencesOffered || []);
  const refSection = doc.sections.find((s) => /reference/i.test(s.title));
  if (refSection) {
    for (const c of ctx.citedCaseStudies || []) {
      if (refSection.text.toLowerCase().includes(c.name.toLowerCase())) out.add(c.name);
    }
  }
  return [...out];
}

export function f86(doc: ParsedDoc, rfp: ParsedDoc | null, ctx: GateContext): GateFinding {
  if (!ctx.referencesOffered?.length) return finding("F86", "skipped", -1, "Needs `referencesOffered` in the context registry.");
  const prefs = minedPreferences(rfp, ctx);
  if (!prefs.length) return finding("F86", "pass", 0, "The RFP states no reference preferences to score against.");
  const prefTerms = new Set(prefs.flatMap((p) => contentWords(p)));
  const offered = offeredReferences(doc, ctx);
  const out: GateExample[] = [];
  let problems = 0;
  let anyMatch = false;
  for (const ref of offered) {
    const refProfile = (ctx.citedCaseStudies || []).find((c) => c.name.toLowerCase() === ref.toLowerCase());
    const refTerms = contentWords(ref + " " + (refProfile ? [refProfile.subsector, refProfile.orgType, refProfile.region].filter(Boolean).join(" ") : ""));
    const matches = refTerms.some((t) => prefTerms.has(t));
    if (matches) anyMatch = true;
    else out.push(ex("(references)", `${ref}: matches no stated preference`));
  }
  if (!anyMatch) { problems++; out.unshift(ex("(references)", "No reference matches any preference the RFP states.")); }
  // Asymmetry: an org cited as evidence in the body but not offered as a reference.
  for (const c of ctx.citedCaseStudies || []) {
    if (doc.raw.includes(c.name) && !offered.some((r) => r.toLowerCase() === c.name.toLowerCase())) {
      problems++;
      out.push(ex("(references)", `“${c.name}” is cited as evidence in the body but is not offered as a reference`));
    }
  }
  if (!problems) return finding("F86", "pass", 0, "0 reference problems against the RFP's stated preferences.", out);
  return finding("F86", "deficiency", problems, `${problems} reference problems against the RFP's stated preferences.`, out);
}

// ---- F87 · ghost validity -------------------------------------------------

export function f87(doc: ParsedDoc): GateFinding {
  const GHOST = /\b(unlike (?:other|most) (?:agencies|firms|vendors|partners)|the only (?:agency|firm|partner|vendor)|no other (?:agency|firm|vendor)|first and only|few agencies can)\b/i;
  const hits = doc.sentences.filter((s) => GHOST.test(s.text) && !/\d|\$|%/.test(s.text));
  if (!hits.length) return finding("F87", "pass", 0, "0 unsupportable or improper competitive claims.");
  return finding("F87", "weakness", hits.length, `${hits.length} competitive claims carry no support.`, hits.map((s) => ex(s.section, s.text)));
}

// ---- F88 · public record --------------------------------------------------

export function f88(doc: ParsedDoc, ctx: GateContext): GateFinding {
  if (!ctx.clientFacts?.length) return finding("F88", "skipped", -1, "Needs `clientFacts` (label, value) from the client's public record.");
  const out: GateExample[] = [];
  let used = 0;
  let contradictions = 0;
  for (const fact of ctx.clientFacts) {
    const terms = contentWords(fact.label);
    const hit = doc.sentences.find((s) => {
      const low = s.text.toLowerCase();
      return terms.every((t) => low.includes(t)) && /\d/.test(s.text);
    });
    if (!hit) continue;
    used++;
    const nums = (hit.text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => parseFloat(n.replace(/,/g, "")));
    const nearest = nums.sort((a, b) => Math.abs(a - fact.value) - Math.abs(b - fact.value))[0];
    if (nearest !== undefined && fact.value && Math.abs(nearest - fact.value) / Math.abs(fact.value) > 0.02) {
      contradictions++;
      out.push(ex(hit.section, `“${fact.label}” stated as ${nearest} vs the client's published ${fact.value}`));
    }
  }
  const summary = `${contradictions} contradictions against the client's own public record; ${used} public facts used.`;
  if (!contradictions) return finding("F88", "pass", 0, summary);
  return finding("F88", "weakness", contradictions, summary, out);
}

// ---- F89 · confidence calibration ----------------------------------------

export function f89(doc: ParsedDoc): GateFinding {
  const PROJ = /\b(we project|projected|forecast|expects? to|estimated?|anticipate[ds]?|should (?:produce|generate|yield))\b/i;
  const projections = doc.sentences.filter((s) => PROJ.test(s.text) && /\d/.test(s.text));
  if (!projections.length) return finding("F89", "pass", 0, "0 projections made — nothing to calibrate.");
  const ranges = projections.filter((s) => /\d\s*[–-]\s*\$?\d|\bbetween\b.*\band\b|\bfrom\b.*\bto\b/.test(s.text)).length;
  const central = projections.filter((s) => /\b(base case|central case|midpoint|conservative case|planning number)\b/i.test(s.text)).length;
  const summary = `${ranges} stated ranges, ${central} named central cases.`;
  if (ranges || central) return finding("F89", "pass", 0, summary);
  return finding("F89", "weakness", projections.length, summary,
    [ex(projections[0].section, "the document makes projections but states no range"), ...projections.slice(0, 2).map((s) => ex(s.section, s.text))]);
}

// ---- F90 · denominators ---------------------------------------------------

export function f90(doc: ParsedDoc): GateFinding {
  const BASE = /\bof\s+(?:the\s+|these\s+|those\s+|its\s+|our\s+|your\s+)?[\d,]+|\bn\s*=\s*\d|\bout of\s+[\d,]+|\bper\s+[\d,]+|\bbase of\b|\b(?:respondents|donors|records|pieces|households)\b.*\b\d{2,}/i;
  const RATE_CONTEXT = /\bresponse rate|open rate|click|retention|return on|roi\b/i; // rates named with period/config elsewhere
  const naked: GateExample[] = [];
  for (const s of doc.sentences) {
    const pcts = s.text.match(/\b\d+(?:\.\d+)?\s?%/g);
    if (!pcts) continue;
    if (BASE.test(s.text) || RATE_CONTEXT.test(s.text)) continue;
    naked.push(ex(s.section, s.text));
  }
  if (!naked.length) return finding("F90", "pass", 0, "0 percentages stated without a visible base.");
  return finding("F90", "weakness", naked.length, `${naked.length} percentages stated without a visible base.`, naked);
}
