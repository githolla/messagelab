import { NextRequest, NextResponse } from "next/server";
import type { FocusSubject, Sentiment } from "@/lib/focus";
import { SENTIMENTS, kindDef } from "@/lib/focus";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const maxDuration = 60;

const SENT = new Set<string>(SENTIMENTS);
function coerceSent(v: unknown): Sentiment {
  return SENT.has(v as string) ? (v as Sentiment) : "neutral";
}
function coerce15(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
function imageBlock(dataUrl: string): Block | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 500 });

  let persona: { id: string; name: string; segment: string; how?: string; dims?: Record<string, string> };
  let subject: FocusSubject;
  try {
    const parsed = (await req.json()) as { persona: typeof persona; subject: FocusSubject };
    persona = parsed.persona;
    subject = parsed.subject;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!persona?.id || !subject?.kind) return NextResponse.json({ error: "Request needs a persona and a subject." }, { status: 400 });

  const def = kindDef(subject.kind);
  const dims = persona.dims ? Object.entries(persona.dims).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
  const system = `You are ${persona.name}, a real member of a focus group in the ${subject.industry || "general"} space. Your type: ${persona.segment}${persona.how ? ` — ${persona.how}` : ""}.${dims ? `\n${dims}` : ""}\nReact as THIS specific person — bring your own priorities, skepticism, and mood. Honest, blunt reactions are what the panel is for; "I'd pass" is a valid answer.`;

  const intro = `You're reviewing a ${def.label.toLowerCase()}${subject.productType ? ` (a ${subject.productType})` : ""}${subject.format ? `, in the form of a ${subject.format.toLowerCase()}` : ""}. Weigh it on: ${def.lens}.${subject.goal?.trim() ? ` The team is specifically trying to learn: "${subject.goal.trim()}" — keep that question front of mind as you react.` : ""}`;
  const q = `## What you're reviewing${subject.title ? `\nTitle: ${subject.title}` : ""}\n\n${subject.body}\n\n## Give your honest reaction
1. sentiment — one of: "love" | "like" | "neutral" | "skeptical" | "reject".
2. likelihood — how likely YOU are to ${def.verb} (1 = not at all, 5 = definitely).
3. resonates — the ONE thing that most works for you (specific).
4. concern — your single biggest concern or hesitation.
5. question — the first question you'd ask.
6. suggestion — one concrete change that would improve it for you.
7. quote — one sentence in your own voice summing up your reaction.

Respond with ONLY this JSON (no markdown fences):
{ "sentiment": "...", "likelihood": 1-5, "resonates": "...", "concern": "...", "question": "...", "suggestion": "...", "quote": "..." }`;

  const imgs = (subject.images || []).map(imageBlock).filter(Boolean) as Block[];
  const content: string | Block[] = imgs.length
    ? [{ type: "text", text: `${intro}\n\n${q}` } as Block, ...imgs]
    : `${intro}\n\n${q}`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  let text: string;
  try {
    text = await callModel({ apiKey, model, maxTokens: 700, system, messages: [{ role: "user", content }] });
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

  return NextResponse.json({
    sentiment: coerceSent(p.sentiment),
    likelihood: coerce15(p.likelihood),
    resonates: str(p.resonates),
    concern: str(p.concern),
    question: str(p.question),
    suggestion: str(p.suggestion),
    quote: str(p.quote),
    personaId: persona.id,
    personaName: persona.name,
    segment: persona.segment,
    segmentHow: persona.how,
    model,
  });
}
