import { NextRequest, NextResponse } from "next/server";
import type { PersonaResult, Variants } from "@/lib/types";
import { INTENT_LABELS, INTENT_ORDER } from "@/lib/types";
import { tally, GIVE_INTENTS } from "@/lib/refine";
import { ANALYSTS } from "@/lib/archetypes";
import { industry } from "@/lib/industries";

export const maxDuration = 60;

function segments(results: PersonaResult[]): string[] {
  const seen: string[] = [];
  for (const r of results) if (!seen.includes(r.giving)) seen.push(r.giving);
  return seen;
}

function mean(xs: number[]): string {
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–";
}

function buildSummary(variants: Variants, results: PersonaResult[]): string {
  const t = tally(results);
  const labels = INTENT_LABELS[variants.assetType];
  const intentLine = (k: "intentA" | "intentB") =>
    INTENT_ORDER.map((i) => `${labels[i]}: ${results.filter((r) => r[k] === i).length}`).join(", ");
  const segLines = segments(results)
    .map((g) => {
      const rs = results.filter((r) => r.giving === g);
      const convA = rs.filter((r) => GIVE_INTENTS.includes(r.intentA)).length;
      const convB = rs.filter((r) => GIVE_INTENTS.includes(r.intentB)).length;
      return `  ${g} (n=${rs.length}): resonance A ${mean(rs.map((r) => r.resonanceA))} / B ${mean(
        rs.map((r) => r.resonanceB)
      )}; would-convert A ${convA} / B ${convB}`;
    })
    .join("\n");
  const quotes = results
    .slice(0, 20)
    .map((r) => `  [${r.giving}, voted ${r.winner}] ${r.rationale}`)
    .join("\n");

  return `Panel: ${results.length} simulated reactions across ${segments(results).length} audience archetypes.
Head-to-head votes: A ${t.votesA}, B ${t.votesB}, either ${
    results.length - t.votesA - t.votesB - t.neither
  }, neither ${t.neither}.
Would convert: A ${t.givesA}, B ${t.givesB}.
Intent distribution A: ${intentLine("intentA")}
Intent distribution B: ${intentLine("intentB")}
By archetype (resonance A/B; would-convert A/B):
${segLines}
Reaction rationales:
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

  const { variants, results, industry: industryKey } = (await req.json()) as {
    variants: Variants;
    results: PersonaResult[];
    industry?: string;
    };

  if (!results?.length) {
    return NextResponse.json({ error: "No results to analyze." }, { status: 400 });
  }

  const ind = industry(industryKey);
  const industryLine =
    ind && ind.key !== "general" ? `Industry context: ${ind.label}. ${ind.guidance}` : "";
  const analystList = ANALYSTS.map((a) => `- ${a.key} (${a.label}): ${a.lens}`).join("\n");

  const schema = `Respond with ONLY a JSON object, no markdown fences:
{
  "verdict": "ship_a" | "ship_b" | "rework" | "tie",
  "headline": "one punchy sentence — the single most important takeaway",
  "summary": "2-4 sentence executive summary a busy stakeholder can act on",
  "keyPoints": [ {"point": "the finding in a few words", "why": "one sentence of reasoning grounded in a specific number or a quoted reaction"} ],
  "segments": [ {"segment": "archetype name exactly as given", "driver": "what pulled this group toward acting", "barrier": "what held them back", "divergence": "how A vs B differed for them"} ],
  "actions": [ {"priority": "high" | "medium" | "low", "action": "one concrete, specific change to make"} ],
  "analysts": [ {"key": "one of the analyst keys", "read": "1-2 sentence read through that lens, grounded in the data"} ]
}
Include 4-6 keyPoints ordered most-important first — these are the reasons behind the verdict, and each "why" must cite a specific count, rate, or quoted rationale (not a generalization). Include one segments entry per archetype, one analysts entry per analyst key (${ANALYSTS.map(
    (a) => a.key
  ).join(", ")}), and 3-6 actions ordered most-impactful first. Ground every claim in the numbers or rationales — no generic advice.`;

  const user = `Two versions of a ${variants.assetType.replace("_", " ")} were tested against a simulated audience panel. ${industryLine}

## Version A — "${variants.labelA}"
${variants.assetType === "website" ? "(tested as a screenshot)" : variants.copyA}

## Version B — "${variants.labelB}"
${variants.assetType === "website" ? "(tested as a screenshot)" : variants.copyB}

## Panel results
${buildSummary(variants, results)}

## Your task
You are a panel of specialist analysts:
${analystList}
Interpret the reactions into a decision-ready report. ${schema}`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      system:
        "You are a team of senior conversion, trust, accessibility, copy, and brand analysts. You turn simulated-audience reactions into a crisp, evidence-driven, decision-ready report. No fluff, no hedging beyond the stated caveats.",
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
    return NextResponse.json({ error: "Model returned no parseable analysis." }, { status: 502 });
  }
  try {
    const analysis = JSON.parse(match[0]);
    return NextResponse.json({ analysis, model });
  } catch {
    return NextResponse.json({ error: "Analysis JSON failed to parse." }, { status: 502 });
  }
}
