import { NextRequest, NextResponse } from "next/server";
import type { AssetType, Persona, Variants } from "@/lib/types";

export const maxDuration = 60;

const SCHEMA_HINT = `Respond with ONLY a JSON object, no markdown fences, matching:
{
  "intentA": "dismiss" | "engage_no_gift" | "save_for_later" | "give_small" | "give_suggested" | "give_more",
  "intentB": same options as intentA,
  "resonanceA": 1-5,
  "resonanceB": 1-5,
  "trust": "version_a" | "version_b" | "both_equal" | "neither",
  "winner": "send_a" | "send_b" | "either" | "neither",
  "rationale": "1-2 sentences quoting or describing the specific line or element that moved you or put you off",
  "baselineIntent": 1-5
}`;

const CHANNELS: Record<
  AssetType,
  { intro: string; intentQ: string; intentDefs: string; winnerQ: string }
> = {
  email: {
    intro: "Two versions of a fundraising email are being tested.",
    intentQ: "If Version A arrived in your inbox, what would you most likely do?",
    intentDefs:
      '"dismiss" = delete it unread; "engage_no_gift" = read it but take no action; "save_for_later" = keep it to maybe act on later',
    winnerQ: "If only one email could be sent, which should it be?",
  },
  direct_mail: {
    intro: "Two versions of a fundraising letter (postal direct mail) are being tested.",
    intentQ: "If Version A arrived in your mailbox, what would you most likely do?",
    intentDefs:
      '"dismiss" = toss it unopened; "engage_no_gift" = read it but take no action; "save_for_later" = set it aside to maybe act on later',
    winnerQ: "If only one letter could be mailed, which should it be?",
  },
  website: {
    intro:
      "Two versions of a nonprofit donation web page are being tested. A screenshot of each version follows.",
    intentQ: "If you landed on Version A, what would you most likely do?",
    intentDefs:
      '"dismiss" = leave the page within seconds; "engage_no_gift" = look around but not give; "save_for_later" = bookmark it or plan to come back',
    winnerQ: "If only one page could go live, which should it be?",
  },
};

// Deterministic per-persona presentation order (FNV-1a on the id). Half the
// panel sees B first, countering primacy/position bias in this within-subject
// head-to-head. Deterministic so demos and reruns are reproducible.
function presentationOrder(id: string): "ab" | "ba" {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? "ab" : "ba";
}

function personaBlock(p: Persona): string {
  const dims = Object.entries(p.dimensions)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `You are answering as this person. Stay fully in character — react the way THIS person would, not the way an average or agreeable person would.\n\nname: ${p.name}\n${dims}`;
}

function questionnaire(ch: (typeof CHANNELS)[AssetType]): string {
  return `## Questionnaire

1. intentA — ${ch.intentQ}
   Options: ${ch.intentDefs}; "give_small" = give under $25; "give_suggested" = give $25–$100; "give_more" = give $100+.
2. intentB — Same question for Version B.
3. resonanceA — How emotionally compelling was Version A? (1 = not at all, 5 = extremely)
4. resonanceB — Same for Version B.
5. trust — Which version made the organization feel more trustworthy with your money?
6. winner — ${ch.winnerQ}
7. rationale — What most drove your winner choice? Quote or describe the specific line or element.
8. baselineIntent — How likely are you to give to this kind of cause at all this season, regardless of these appeals? (1-5)

${SCHEMA_HINT}`;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function imageBlock(dataUrl: string): ContentBlock | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
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

  const ch = CHANNELS[variants.assetType] ?? CHANNELS.email;
  const preamble = `${ch.intro} React to both, then answer the questionnaire honestly as yourself. "I would ignore this" and low ratings are valid answers. Judge each version on its own merits — there is no expected "right" answer, and preferring neither is fine.`;
  const order = presentationOrder(persona.id);

  const blockA = { label: `## Version A — "${variants.labelA}"`, copy: variants.copyA, img: variants.imageA };
  const blockB = { label: `## Version B — "${variants.labelB}"`, copy: variants.copyB, img: variants.imageB };
  const [first, second] = order === "ab" ? [blockA, blockB] : [blockB, blockA];

  let content: string | ContentBlock[];
  if (variants.assetType === "website") {
    const imgFirst = first.img && imageBlock(first.img);
    const imgSecond = second.img && imageBlock(second.img);
    if (!imgFirst || !imgSecond) {
      return NextResponse.json(
        { error: "Website tests need a screenshot for both versions." },
        { status: 400 }
      );
    }
    content = [
      { type: "text", text: `${preamble}\n\n${first.label}` },
      imgFirst,
      { type: "text", text: second.label },
      imgSecond,
      { type: "text", text: questionnaire(ch) },
    ];
  } else {
    content = `${preamble}

${first.label}

${first.copy}

${second.label}

${second.copy}

${questionnaire(ch)}`;
  }

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
      max_tokens: 1024,
      system: personaBlock(persona),
      messages: [{ role: "user", content }],
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
      model,
      order,
    });
  } catch {
    return NextResponse.json(
      { error: "Model JSON failed to parse." },
      { status: 502 }
    );
  }
}
