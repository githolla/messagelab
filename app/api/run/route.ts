import { NextRequest, NextResponse } from "next/server";
import type { AssetType, IntentChoice, Persona, Variants } from "@/lib/types";
import { INTENT_ORDER } from "@/lib/types";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const maxDuration = 60;

// Validate model output against the known enums/ranges so garbage (a string
// resonance, an out-of-vocab intent, a null winner) can't skew tally() or the
// Wilson CIs the dashboard presents as precise.
const TRUST = new Set(["version_a", "version_b", "both_equal", "neither"]);
const WINNER = new Set(["send_a", "send_b", "either", "neither"]);
function coerceIntent(v: unknown): IntentChoice {
  return INTENT_ORDER.includes(v as IntentChoice) ? (v as IntentChoice) : "engage_no_gift";
}
function coerce15(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
}
function coerceEnum(v: unknown, set: Set<string>, fallback: string): string {
  return typeof v === "string" && set.has(v) ? v : fallback;
}

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
  social: {
    intro: "Two versions of a social media post are being tested.",
    intentQ: "If Version A appeared in your feed, what would you most likely do?",
    intentDefs:
      '"dismiss" = scroll right past; "engage_no_gift" = read or like it but take no further action; "save_for_later" = save or bookmark it to maybe act on later',
    winnerQ: "If only one post could be published, which should it be?",
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
   Options: ${ch.intentDefs}; "give_small" = would take this asset's primary action (buy, sign up, subscribe, book, donate — whatever it asks) but with low intent; "give_suggested" = would take it with clear intent; "give_more" = would take it enthusiastically, or go further (upgrade, larger commitment, tell others).
2. intentB — Same question for Version B.
3. resonanceA — How emotionally compelling was Version A? (1 = not at all, 5 = extremely)
4. resonanceB — Same for Version B.
5. trust — Which version made the organization feel more trustworthy?
6. winner — ${ch.winnerQ}
7. rationale — What most drove your winner choice? Quote or describe the specific line or element.
8. baselineIntent — How likely are you to take this kind of action at all right now, regardless of these versions? (1-5)

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

  let persona: Persona;
  let variants: Variants;
  try {
    const parsed = (await req.json()) as { persona: Persona; variants: Variants };
    persona = parsed.persona;
    variants = parsed.variants;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!persona || !persona.dimensions || !variants || !variants.assetType) {
    return NextResponse.json(
      { error: "Request must include a persona (with dimensions) and variants." },
      { status: 400 }
    );
  }

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

  let text: string;
  try {
    text = await callModel({
      apiKey,
      model,
      maxTokens: 1024,
      system: personaBlock(persona),
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    const err = e instanceof ModelError ? e : new ModelError(502, "unknown error");
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(text);
  } catch {
    return NextResponse.json({ error: "Model returned no parseable JSON." }, { status: 502 });
  }

  // Validate/coerce every field before it reaches the tally + stats. The
  // server-authored identity fields go LAST so a hallucinated persona id/name
  // can't override the ground truth.
  return NextResponse.json({
    intentA: coerceIntent(parsed.intentA),
    intentB: coerceIntent(parsed.intentB),
    resonanceA: coerce15(parsed.resonanceA),
    resonanceB: coerce15(parsed.resonanceB),
    trust: coerceEnum(parsed.trust, TRUST, "neither"),
    winner: coerceEnum(parsed.winner, WINNER, "either"),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    baselineIntent: coerce15(parsed.baselineIntent),
    personaId: persona.id,
    personaName: persona.name,
    giving: persona.giving,
    model,
    order,
  });
}
