import { NextRequest, NextResponse } from "next/server";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";
import { STANCES, type RoomStance } from "@/lib/gate/room";

export const maxDuration = 60;

// One committee persona reads their slice of the proposal in character and
// returns a structured read. The client fans out one call per persona.

interface RoomBody {
  evaluator: { id: string; name: string; brief: string; emits: string; family: string };
  lens?: { name: string; brief: string };
  buyerState?: { name: string; brief: string; emits: string };
  scopeNote: string;
  visibleText: string;
  rfpExcerpt?: string;
  gateBriefing?: string;
  canVeto: boolean;
}

const STANCE_SET = new Set<string>(STANCES);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 500 });

  let body: RoomBody;
  try {
    body = (await req.json()) as RoomBody;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!body?.evaluator?.id || !body.visibleText?.trim()) {
    return NextResponse.json({ error: "Request needs an evaluator and the text they read." }, { status: 400 });
  }

  const ev = body.evaluator;
  const system = `You are sitting on a nonprofit's vendor-selection committee, evaluating ONE proposal.
Your role: ${ev.name}. ${ev.brief}
What you produce for the committee: ${ev.emits}.
${body.lens ? `Sector context (${body.lens.name}): ${body.lens.brief}` : ""}
${body.buyerState ? `The committee's buying state (${body.buyerState.name}): ${body.buyerState.brief} ${body.buyerState.emits}.` : ""}
React as THIS person, with their scope, their scar tissue, and their standards. You saw ONLY the excerpt below (${body.scopeNote}) — do not pretend you read more. Blunt professional judgement; "I would not shortlist this" is a valid answer.${body.canVeto ? " Your role can veto but not approve — veto only for a genuine screen-out defect in your lane." : ""}`;

  const prompt = `${body.gateBriefing ? `## Mechanical pre-check (deterministic, ran before you)\n${body.gateBriefing.slice(0, 1500)}\n\n` : ""}${body.rfpExcerpt ? `## What our RFP asked for (excerpt)\n${body.rfpExcerpt.slice(0, 3500)}\n\n` : ""}## What you read of the proposal (${body.scopeNote})
${body.visibleText.slice(0, 14000)}

## Your read, for the committee record
1. score — 0 to 5 against the rubric as you weigh it (decimals fine).
2. stance — one of: "champion" | "supportive" | "neutral" | "skeptical" | "opposed".
3. veto — true ONLY if a screen-out defect in your lane disqualifies this proposal.${body.canVeto ? "" : " (Your role cannot veto — answer false.)"}
4. quote — the ONE sentence you would actually say in the committee meeting, in your voice.
5. strength — the strongest thing in what you read (specific, quote or point to it).
6. concern — your single biggest concern from what you read.
7. question — the question you would ask the agency in the finalist interview.
8. recordable — the line you would write on the official scoresheet.

Respond with ONLY this JSON (no fences):
{ "score": 0-5, "stance": "...", "veto": true|false, "quote": "...", "strength": "...", "concern": "...", "question": "...", "recordable": "..." }`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  let text: string;
  try {
    text = await callModel({ apiKey, model, maxTokens: 700, system, messages: [{ role: "user", content: prompt }] });
  } catch (e) {
    const err = e instanceof ModelError ? e : new ModelError(502, "unknown error");
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  let p: Record<string, unknown>;
  try {
    p = extractJson(text);
  } catch {
    return NextResponse.json({ error: "Model returned no parseable JSON." }, { status: 502 });
  }

  const scoreN = Number(p.score);
  const stance = STANCE_SET.has(p.stance as string) ? (p.stance as RoomStance) : "neutral";
  return NextResponse.json({
    evaluatorId: ev.id,
    name: ev.name,
    family: ev.family === "G" ? "G" : "A",
    scopeNote: body.scopeNote,
    score: Number.isFinite(scoreN) ? Math.max(0, Math.min(5, scoreN)) : 2.5,
    stance,
    veto: body.canVeto && (p.veto === true || p.veto === "true"),
    quote: str(p.quote),
    strength: str(p.strength),
    concern: str(p.concern),
    question: str(p.question),
    recordable: str(p.recordable),
    model,
  });
}
