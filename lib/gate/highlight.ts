// Maps gate findings back onto the proposal text as character spans, so the
// review UI can highlight the exact offending passage. Pure + deterministic.
// Not every finding lives in the document (registry rows, RFP-side
// requirements, whole-document stats) — those get no span and the UI falls
// back to the section anchor or none.

import type { GateFinding } from "./model";

export interface DocMark {
  start: number;
  end: number;
  findingId: string;
  verdict: "deficiency" | "weakness";
  key: string; // findingId-exampleIndex(-occurrence)
}

const NO_SPAN_PREFIXES = [
  "missing prescribed column",
  "frequent rfp terms absent",
  "avg sentence",
  "no reference matches",
  "the document makes projections",
];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whitespace-insensitive search: the quote was flattened, the doc was not. */
function findSpan(raw: string, needle: string, from = 0): { start: number; end: number } | null {
  const n = needle.trim();
  if (n.length < 5) return null;
  const pattern = esc(n).replace(/\s+/g, "[\\s]+");
  try {
    const re = new RegExp(pattern, "i");
    const m = re.exec(raw.slice(from));
    if (!m) return null;
    return { start: from + m.index, end: from + m.index + m[0].length };
  } catch {
    return null;
  }
}

function allSpans(raw: string, phrase: string, cap = 12): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let from = 0;
  while (out.length < cap) {
    const s = findSpan(raw, phrase, from);
    if (!s) break;
    out.push(s);
    from = s.end;
  }
  return out;
}

/** Decide what text in the document this example points at. */
function needlesFor(findingId: string, quote: string): { phrase?: string; sentence?: string } {
  const q = quote.replace(/…$/, "").trim();
  const low = q.toLowerCase();
  if (findingId === "D49") return {}; // D49 quotes the RFP, not the proposal
  if (NO_SPAN_PREFIXES.some((p) => low.startsWith(p))) return {};
  if (/^\d+ (paragraphs|tables)/.test(low)) return {};

  let m = q.match(/ — in: (.+)$/);
  if (m) return { sentence: m[1] };
  m = q.match(/^stale term [“"](.+?)[”"]/);
  if (m) return { phrase: m[1] };
  m = q.match(/^[“"](.+?)[”"] × \d/);
  if (m) return { phrase: m[1] };
  m = q.match(/^[“"](.+?)[”"] (carries|stated as)/);
  if (m) return { phrase: m[1] };
  m = q.match(/^impossible date [“"](.+?)[”"]/);
  if (m) return { phrase: m[1] };
  m = q.match(/^(.+?) appears without the correct title/);
  if (m) return { phrase: m[1] };
  m = q.match(/^column [“"](.+?)[”"] sums to/);
  if (m) return { phrase: m[1] };
  m = q.match(/^near-duplicate[^:]*: (.+)$/);
  if (m) return { sentence: m[1] };
  m = q.match(/^[“"](.+?)[”"] is cited as evidence/);
  if (m) return { phrase: m[1] };
  m = q.match(/^([A-Z][^:]{2,50}): (matches no stated preference|match \d)/);
  if (m) return { phrase: m[1] };
  return { sentence: q.slice(0, 110) };
}

export function locateFindings(raw: string, findings: GateFinding[]): DocMark[] {
  const marks: DocMark[] = [];
  for (const f of findings) {
    if (f.verdict !== "deficiency" && f.verdict !== "weakness") continue;
    f.examples.forEach((exm, i) => {
      const { phrase, sentence } = needlesFor(f.id, exm.quote);
      if (phrase) {
        allSpans(raw, phrase).forEach((s, j) => {
          marks.push({ ...s, findingId: f.id, verdict: f.verdict as DocMark["verdict"], key: `${f.id}-${i}-${j}` });
        });
      } else if (sentence) {
        const s = findSpan(raw, sentence);
        if (s) marks.push({ ...s, findingId: f.id, verdict: f.verdict as DocMark["verdict"], key: `${f.id}-${i}-0` });
      }
    });
  }
  // Sort; on overlap keep the earlier-starting (deficiencies were pushed in
  // finding order, which is severity order after sortFindings).
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: DocMark[] = [];
  let lastEnd = -1;
  for (const mk of marks) {
    if (mk.start < lastEnd) continue;
    out.push(mk);
    lastEnd = mk.end;
  }
  return out;
}

/** True when this finding has at least one span in the document. */
export function findingHasMarks(marks: DocMark[], findingId: string): boolean {
  return marks.some((m) => m.findingId === findingId);
}

/** The first mark key for an example (exampleIndex) of a finding, if located. */
export function exampleMarkKey(marks: DocMark[], findingId: string, exampleIndex: number): string | null {
  const m = marks.find((mk) => mk.key.startsWith(`${findingId}-${exampleIndex}-`));
  return m ? m.key : null;
}
