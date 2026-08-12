// Turn a completed run into portable deliverables: a structured JSON file (with
// a reproducibility manifest) and a printable Markdown report. All the data
// already lives in client state — this just serializes it so a strategist can
// keep, share, or attach the result instead of it vanishing on refresh.

import type { AssetType, PersonaResult, Variants } from "./types";
import { INTENT_LABELS, segmentLabel } from "./types";
import { GIVE_INTENTS } from "./refine";
import { shareWithCI, wilson } from "./stats";
import { VERDICT_LABEL, type Analysis } from "./analysis";
import { personaDemographics, cohortSummary, emptyCohort, type CohortFacets } from "./cohort";

export interface ExportInput {
  variants: Variants;
  results: PersonaResult[];
  analysis: Analysis | null;
  industryKey: string;
  industryLabel: string;
  assetType: AssetType;
  model: string | null;
  isDemo: boolean;
  generatedAt: string; // ISO timestamp
  confidence: { label: string; note: string } | null;
  facets?: CohortFacets;
  cohortText?: string;
}

function counts(results: PersonaResult[]) {
  const gA = results.filter((r) => GIVE_INTENTS.includes(r.intentA)).length;
  const gB = results.filter((r) => GIVE_INTENTS.includes(r.intentB)).length;
  const votesA = results.filter((r) => r.winner === "send_a").length;
  const votesB = results.filter((r) => r.winner === "send_b").length;
  const either = results.filter((r) => r.winner === "either").length;
  const neither = results.filter((r) => r.winner === "neither").length;
  const trustA = results.filter((r) => r.trust === "version_a").length;
  const trustB = results.filter((r) => r.trust === "version_b").length;
  const orderAB = results.filter((r) => r.order === "ab").length;
  const orderBA = results.filter((r) => r.order === "ba").length;
  const meanA = results.length
    ? results.reduce((s, r) => s + (r.resonanceA || 0), 0) / results.length
    : 0;
  const meanB = results.length
    ? results.reduce((s, r) => s + (r.resonanceB || 0), 0) / results.length
    : 0;
  return { gA, gB, votesA, votesB, either, neither, trustA, trustB, orderAB, orderBA, meanA, meanB };
}

/** The full JSON payload written to disk on "Download run". */
export function buildRunExport(input: ExportInput): Record<string, unknown> {
  const { results, variants, analysis } = input;
  const facets = input.facets ?? emptyCohort();
  const c = counts(results);
  const n = results.length;
  return {
    manifest: {
      tool: "Message Lab — A/B message test",
      generatedAt: input.generatedAt,
      demo: input.isDemo,
      model: input.model,
      industry: { key: input.industryKey, label: input.industryLabel },
      assetType: input.assetType,
      panelSize: n,
      cohort: { summary: cohortSummary(facets, input.cohortText ?? ""), facets, description: input.cohortText ?? "" },
      presentationOrders: { ab: c.orderAB, ba: c.orderBA },
      methodology:
        "Persona-agent simulation (MatrAIx-grounded): model-dependent, hypothesis-generating, not a prediction. A/B presentation order alternated per persona; give-rates reported with 95% Wilson intervals.",
    },
    verdict: analysis
      ? { key: analysis.verdict, label: VERDICT_LABEL[analysis.verdict], headline: analysis.headline }
      : null,
    confidence: input.confidence,
    scoreboard: {
      wouldConvert: {
        a: c.gA,
        b: c.gB,
        n,
        ciA: n ? wilson(c.gA, n) : null,
        ciB: n ? wilson(c.gB, n) : null,
      },
      headToHead: { choseA: c.votesA, choseB: c.votesB, noPreference: c.either, rejectedBoth: c.neither },
      trust: { a: c.trustA, b: c.trustB },
      resonance: { a: Number(c.meanA.toFixed(2)), b: Number(c.meanB.toFixed(2)) },
    },
    analysis: analysis
      ? {
          summary: analysis.summary,
          keyPoints: analysis.keyPoints ?? [],
          actions: analysis.actions ?? [],
          segments: analysis.segments ?? [],
          analysts: analysis.analysts ?? [],
        }
      : null,
    variants: {
      labelA: variants.labelA,
      labelB: variants.labelB,
      copyA: input.assetType === "website" ? "(screenshot)" : variants.copyA,
      copyB: input.assetType === "website" ? "(screenshot)" : variants.copyB,
    },
    results: results.map((r) => ({
      persona: r.personaName,
      demographics: personaDemographics(r.personaId, facets),
      segment: r.giving,
      chose: r.winner,
      trust: r.trust,
      intentA: r.intentA,
      intentB: r.intentB,
      resonanceA: r.resonanceA,
      resonanceB: r.resonanceB,
      baselineIntent: r.baselineIntent,
      order: r.order,
      rationale: r.rationale,
    })),
  };
}

/** A printable Markdown report — the same content, formatted for a doc/PDF. */
export function runToMarkdown(input: ExportInput): string {
  const { results, variants, analysis } = input;
  const facets = input.facets ?? emptyCohort();
  const c = counts(results);
  const n = results.length;
  const L: string[] = [];
  const labels = INTENT_LABELS[input.assetType];

  L.push(`# Message test — ${analysis ? VERDICT_LABEL[analysis.verdict] : "results"}`);
  if (input.isDemo) L.push(`> **DEMO — sample data, not a real run.**`);
  L.push("", `**Cohort:** ${cohortSummary(facets, input.cohortText ?? "")}`);
  if (analysis?.headline) L.push("", analysis.headline);
  if (input.confidence) L.push("", `**Confidence:** ${input.confidence.label} — ${input.confidence.note}.`);

  L.push("", "## Scoreboard", "");
  L.push(`- **Would convert:** A ${shareWithCI(c.gA, n)} · B ${shareWithCI(c.gB, n)}`);
  L.push(
    `- **Head-to-head:** Chose A ${c.votesA} · Chose B ${c.votesB} · No preference ${c.either} · Rejected both ${c.neither}`
  );
  L.push(`- **Rated more trustworthy:** A ${c.trustA} · B ${c.trustB}`);
  L.push(`- **Avg resonance (of 5):** A ${c.meanA.toFixed(1)} · B ${c.meanB.toFixed(1)}`);
  L.push(`- **Presentation order:** ${c.orderAB} saw A first · ${c.orderBA} saw B first`);

  L.push("", `A = "${variants.labelA}" · B = "${variants.labelB}"`);

  if (analysis?.summary) L.push("", "## Summary", "", analysis.summary);

  if (analysis?.keyPoints?.length) {
    L.push("", "## Why", "");
    analysis.keyPoints.forEach((k, i) => L.push(`${i + 1}. **${k.point}** — ${k.why}`));
  }

  if (analysis?.actions?.length) {
    L.push("", "## What to do", "");
    analysis.actions.forEach((a) => L.push(`- \`${a.priority}\` ${a.action}`));
  }

  if (analysis?.segments?.length) {
    L.push("", "## By segment", "");
    L.push("| Segment | Driver | Barrier | A vs B |");
    L.push("| --- | --- | --- | --- |");
    analysis.segments.forEach((s) =>
      L.push(`| ${segmentLabel(s.segment)} | ${s.driver} | ${s.barrier} | ${s.divergence} |`)
    );
  }

  if (analysis?.analysts?.length) {
    L.push("", "## Analyst reads", "");
    analysis.analysts.forEach((a) => L.push(`- **${a.key}:** ${a.read}`));
  }

  L.push("", "## Every participant", "");
  for (const r of results) {
    const d = personaDemographics(r.personaId, facets);
    L.push(
      `- **${r.personaName}** (${d.age}, ${d.region}, ${segmentLabel(r.giving)}) — chose ${r.winner}; ` +
        `A: ${labels[r.intentA]} / B: ${labels[r.intentB]}. "${r.rationale}"`
    );
  }

  L.push(
    "",
    "---",
    "",
    `Persona-agent simulation${input.model ? ` (${input.model})` : ""} — directional signal, not a prediction. ` +
      `Generated ${input.generatedAt}. Validate high-stakes decisions with real people.`
  );
  return L.join("\n");
}
