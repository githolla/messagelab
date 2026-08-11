import { NextRequest, NextResponse } from "next/server";
import type { Persona, Variants } from "@/lib/types";

export const maxDuration = 60;

const SCHEMA_HINT = `Respond with ONLY a JSON object, no markdown fences, matching:
{
  "intentA": "delete_unread" | "read_no_action" | "save_for_later" | "give_small" | "give_suggested" | "give_more",
  "intentB": same options as intentA,
  "resonanceA": 1-5,
  "resonanceB": 1-5,
  "trust": "version_a" | "version_b" | "both_equal" | "neither",
  "winner": "send_a" | "send_b" | "either" | "neither",
  "rationale": "1-2 sentences quoting the specific line that moved you or put you off",
  "baselineIntent": 1-5
}`;

function personaBlock(p: Persona): string {
  const dims = Object.entries(p.dimensions)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `You are answering as this person. Stay fully in character — react the way THIS person would, not the way an average or agreeable person would.\n\nname: ${p.name}\n${dims}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const { persona, variants } = (await req.json()) as {
    persona: Persona;
    variants: Variants;
  };

  const user = `Two versions of a fundraising email are being tested. Read both, then answer the questionnaire honestly as yourself. "I would delete this" and low ratings are valid answers.

## Version A — "${variants.labelA}"

${variants.copyA}

## Version B — "${variants.labelB}"

${variants.copyB}

## Questionnaire

1. intentA — If Version A arrived in your inbox, what would you most likely do?
2. intentB — Same question for Version B.
3. resonanceA — How emotionally compelling was Version A? (1 = not at all, 5 = extremely)
4. resonanceB — Same for Version B.
5. trust — Which version made the organization feel more trustworthy with your money?
6. winner — If only one email could be sent, which should it be?
7. rationale — What most drove your winner choice? Quote the specific line or element.
8. baselineIntent — How likely are you to give to this kind of cause at all this season, regardless of these emails? (1-5)

${SCHEMA_HINT}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6",
      max_tokens: 1024,
      system: personaBlock(persona),
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
    return NextResponse.json(
      { error: "Model returned no parseable JSON." },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({
      personaId: persona.id,
      personaName: persona.name,
      giving: persona.giving,
      ...parsed,
    });
  } catch {
    return NextResponse.json(
      { error: "Model JSON failed to parse." },
      { status: 502 }
    );
  }
}
