import { NextRequest, NextResponse } from "next/server";
import { kindDef, type FocusKind } from "@/lib/focus";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

// Works for anything — "I want to eat steak tonight" or a GTM plan alike.
const FALLBACK_QUESTIONS = [
  "Who is this for — just you, or others too?",
  "What would make it a clear win?",
  "Any constraints the room should know about (budget, time, effort)?",
  "What's the alternative if you don't do it?",
];

export async function POST(req: NextRequest) {
  let kind: FocusKind = "anything";
  let title = "";
  let body = "";
  let goal = "";
  try {
    const p = (await req.json()) as { kind?: FocusKind; title?: string; body?: string; goal?: string };
    kind = p.kind ?? "anything";
    title = (p.title ?? "").trim().slice(0, 200);
    body = (p.body ?? "").trim().slice(0, 4000);
    goal = (p.goal ?? "").trim().slice(0, 500);
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: "Add what the room will react to first." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ questions: FALLBACK_QUESTIONS, source: "fallback" });

  const def = kindDef(kind);
  const system =
    "You prep a simulated focus group. Given the thing the room will react to, ask the few short questions whose answers would most sharpen the panel's feedback. Anything is fair game — a business plan or a personal decision. Plain language, one line each, no preamble. Return ONLY JSON.";
  const prompt = `The room will react to this ${def.label.toLowerCase()}:
${title ? `Title: ${title}\n` : ""}${body}
${goal ? `\nThe person wants to know: "${goal}"` : ""}

The panel will weigh it on: ${def.lens}.

What 3-4 things would the group most want to know before reacting? Ask only what's genuinely missing — specific, answerable in a few words each.

Respond with ONLY this JSON (no fences):
{ "questions": ["...", "..."] }`;

  let text: string;
  try {
    text = await callModel({ apiKey, model: process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6", maxTokens: 400, system, messages: [{ role: "user", content: prompt }] });
  } catch (e) {
    void (e instanceof ModelError);
    return NextResponse.json({ questions: FALLBACK_QUESTIONS, source: "fallback" });
  }

  try {
    const p = extractJson<{ questions?: unknown }>(text);
    const qs = (Array.isArray(p.questions) ? p.questions : [])
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map((q) => q.trim().slice(0, 200))
      .slice(0, 5);
    return NextResponse.json({ questions: qs.length ? qs : FALLBACK_QUESTIONS, source: qs.length ? "model" : "fallback" });
  } catch {
    return NextResponse.json({ questions: FALLBACK_QUESTIONS, source: "fallback" });
  }
}
