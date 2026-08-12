import { NextRequest, NextResponse } from "next/server";
import type { PersonaResult, Variants } from "@/lib/types";
import { INTENT_LABELS, INTENT_ORDER } from "@/lib/types";
import { tally } from "@/lib/refine";

export const maxDuration = 60;

const CHANNEL_NOUN = { email: "email", direct_mail: "direct mail letter", social: "social media post" } as const;

function mean(xs: number[]): string {
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–";
}

function summarize(variants: Variants, results: PersonaResult[]): string {
  const t = tally(results);
  const labels = INTENT_LABELS[variants.assetType];
  const intentLine = (k: "intentA" | "intentB") =>
    INTENT_ORDER.map(
      (i) => `${labels[i]}: ${results.filter((r) => r[k] === i).length}`
    ).join(", ");
  const segs = results.reduce<string[]>((acc, r) => {
    if (!acc.includes(r.giving)) acc.push(r.giving);
    return acc;
  }, []);
  const segLines = segs
    .map((g) => {
      const rs = results.filter((r) => r.giving === g);
      return `  ${g} (n=${rs.length}): A ${mean(rs.map((r) => r.resonanceA))}, B ${mean(
        rs.map((r) => r.resonanceB)
      )}`;
    })
    .join("\n");
  // Critiques first — neither-voters and each side's detractors are the signal
  // the next draft has to answer.
  const quotes = [...results]
    .sort((a, b) => (a.winner === "neither" ? -1 : 0) - (b.winner === "neither" ? -1 : 0))
    .slice(0, 18)
    .map((r) => `  [${r.giving}, voted ${r.winner}] ${r.rationale}`)
    .join("\n");

  return `Panel: ${results.length} simulated audience reactions across archetypes.
Head-to-head votes: A ${t.votesA}, B ${t.votesB}, either ${
    results.length - t.votesA - t.votesB - t.neither
  }, neither ${t.neither}.
Would give: A ${t.givesA}, B ${t.givesB}.
Intent distribution A: ${intentLine("intentA")}
Intent distribution B: ${intentLine("intentB")}
Mean emotional resonance by segment (A, B):
${segLines}
Persona rationales:
${quotes}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const { variants, results } = (await req.json()) as {
    variants: Variants;
    results: PersonaResult[];
  };

  if (variants.assetType === "website") {
    return NextResponse.json(
      { error: "Refinement drafts are text-only — supported for email, direct mail, and social posts." },
      { status: 400 }
    );
  }
  if (!results?.length) {
    return NextResponse.json({ error: "No results to analyze." }, { status: 400 });
  }

  const t = tally(results);
  // Objective is the would-give rate: keep whichever version more personas said
  // they'd give to, and replace the weaker one with a fresh challenger.
  const champion = t.givesA >= t.givesB ? "a" : "b";
  const champGives = champion === "a" ? t.givesA : t.givesB;
  const champLabel = champion === "a" ? variants.labelA : variants.labelB;
  const noun = CHANNEL_NOUN[variants.assetType];
  const formatNote =
    variants.assetType === "email"
      ? "Include a subject line. Same rough length as the tested versions."
      : variants.assetType === "social"
        ? "In-feed post format (hook line, body, any CTA/hashtags). Same rough length as the tested versions."
        : "Letter format (salutation, body, signature, PS). Same rough length as the tested versions.";

  const user = `Two versions of a ${noun} were tested on a simulated donor persona panel. The goal is to maximize the number of personas who would give. Version ${champion.toUpperCase()} ("${champLabel}") is the current best, with ${champGives} of ${results.length} personas willing to give.

## Version A — "${variants.labelA}"

${variants.copyA}

## Version B — "${variants.labelB}"

${variants.copyB}

## Panel results

${summarize(variants, results)}

## Your task

1. diagnosis — 2 to 4 sentences: why the current best draws the giving it does, and where it is leaving gifts on the table (which segments hesitate, who rejected both, low-resonance groups). Ground every claim in the numbers or rationales above.
2. One new challenger ${noun}, designed to lift the would-give rate above ${champGives}/${results.length}. Keep what is working, fix the diagnosed weaknesses, and fold in any elements of the other version that personas specifically responded to. ${formatNote} Do not simply merge the two versions — make deliberate choices aimed at converting the hesitant and rejecting segments.

Respond with ONLY a JSON object, no markdown fences:
{"diagnosis": "...", "label": "short name for the new draft, e.g. \\"R2 — story + concrete math\\"", "copy": "the full draft"}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6",
      max_tokens: 2500,
      system:
        "You are a senior nonprofit fundraising copywriter and message-testing analyst. Precise, evidence-driven, no fluff.",
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return NextResponse.json(
      { error: `Model call failed (${resp.status}): ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await resp.json();
  const text: string = data.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "Model returned no parseable JSON." }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed.copy || !parsed.label || !parsed.diagnosis) {
      return NextResponse.json({ error: "Model draft was incomplete." }, { status: 502 });
    }
    return NextResponse.json({ ...parsed, champion });
  } catch {
    return NextResponse.json({ error: "Model JSON failed to parse." }, { status: 502 });
  }
}
