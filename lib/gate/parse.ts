// Marked-text loader for the gate. Turns pasted proposal/RFP text into a
// structure the checks can speak: sections, paragraphs, sentences, tables.
// Headings: markdown (#), numbered ("3. Creative approach"), ALL-CAPS lines,
// or short Title Case lines set off by blank lines. Tables: pipe- or
// tab-separated line runs.

export interface GateSentence {
  text: string;
  section: string;
}
export interface GateParagraph {
  text: string;
  section: string;
  words: number;
}
export interface GateTable {
  section: string;
  header: string[];
  rows: string[][]; // data rows, cells as strings
}
export interface ParsedDoc {
  raw: string;
  sections: { title: string; text: string }[];
  paragraphs: GateParagraph[];
  sentences: GateSentence[];
  tables: GateTable[];
  words: number;
}

const FRONT = "(front matter)";

function wordCount(t: string): number {
  return (t.match(/\S+/g) || []).length;
}

function isTableLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const pipes = (t.match(/\|/g) || []).length;
  const tabs = (t.match(/\t/g) || []).length;
  return pipes >= 2 || tabs >= 1;
}

function splitCells(line: string): string[] {
  const t = line.trim().replace(/^\||\|$/g, "");
  const cells = t.includes("|") ? t.split("|") : t.split("\t");
  return cells.map((c) => c.trim());
}

function isRuleRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
}

function isHeading(line: string, prevBlank: boolean, nextBlank: boolean): boolean {
  const t = line.trim();
  if (!t || t.length > 72 || isTableLine(t)) return false;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/[.!?,;]$/.test(t)) return false;
  if (/^\d+[.)]\s+\S/.test(t) && wordCount(t) <= 10) return true;
  if (/^[A-Z][A-Z0-9 &/·:'\-]{3,}$/.test(t)) return true; // ALL CAPS
  if (prevBlank && nextBlank) {
    const ws = t.split(/\s+/);
    if (ws.length <= 8) {
      const caps = ws.filter((w) => /^[A-Z]/.test(w)).length;
      if (caps / ws.length >= 0.7) return true;
    }
  }
  return false;
}

export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  // Split after terminal punctuation followed by a capital/number/quote opener.
  const out = flat.split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/g);
  return out.map((s) => s.trim()).filter((s) => s.length > 1);
}

export function parseDoc(raw: string): ParsedDoc {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const sections: { title: string; text: string }[] = [{ title: FRONT, text: "" }];
  const tables: GateTable[] = [];
  let cur = sections[0];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i + 1 >= lines.length || !lines[i + 1].trim();

    if (isTableLine(line)) {
      const block: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        const cells = splitCells(lines[i]);
        if (!isRuleRow(cells)) block.push(cells);
        i++;
      }
      if (block.length >= 2) {
        tables.push({ section: cur.title, header: block[0], rows: block.slice(1) });
      } else if (block.length === 1) {
        cur.text += "\n" + block[0].join(" — ") + "\n";
      }
      continue;
    }

    if (isHeading(line, prevBlank, nextBlank)) {
      const title = line.trim().replace(/^#{1,6}\s+/, "");
      cur = { title, text: "" };
      sections.push(cur);
      i++;
      continue;
    }

    cur.text += line + "\n";
    i++;
  }

  const paragraphs: GateParagraph[] = [];
  const sentences: GateSentence[] = [];
  for (const s of sections) {
    for (const p of s.text.split(/\n\s*\n/)) {
      const t = p.replace(/\s+/g, " ").trim();
      if (!t) continue;
      paragraphs.push({ text: t, section: s.title, words: wordCount(t) });
      for (const sent of splitSentences(t)) sentences.push({ text: sent, section: s.title });
    }
  }

  return {
    raw,
    sections: sections.filter((s) => s.text.trim() || s.title !== FRONT),
    paragraphs,
    sentences,
    words: wordCount(raw),
    tables,
  };
}

export const FRONT_MATTER = FRONT;
