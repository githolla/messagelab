import { NextRequest, NextResponse } from "next/server";
import { kindDef, type FocusKind } from "@/lib/focus";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RefineBody {
  kind: FocusKind;
  format?: string;
  goal?: string;
  context?: string; // background the room was briefed with
  focusAreas?: string[]; // lenses the room was asked to weigh
  subject: { title?: string; body?: string };
  concerns?: string[];
  suggestions?: string[];
}

// Deterministic challenger when there's no key — a labelled revision that folds
// in the top suggestion and flags the concern it targets.
function heuristicDraft(b: RefineBody): { title: string; body: string } {
  const sug = (b.suggestions || []).filter(Boolean).slice(0, 2);
  const con = (b.concerns || []).filter(Boolean)[0];
  const lead = sug[0] ? `${sug[0].replace(/\.$/, "")}.` : "Lead with the single clearest benefit.";
  const body = `${lead}\n\n${(b.subject.body || "").trim()}${con ? `\n\n(Revised to address: ${con})` : ""}`;
  return { title: (b.subject.title || "").trim(), body };
}

export async function POST(req: NextRequest) {
  let body: RefineBody;
  try {
    body = (await req.json()) as RefineBody;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!body?.subject) return NextResponse.json({ error: "Nothing to refine." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ draft: heuristicDraft(body), source: "heuristic" });

  const def = kindDef(body.kind);
  const system =
    "You are a sharp copy/product editor. You revise a tested asset to win over more of a focus-group panel WITHOUT losing its core intent, voice, or offer. You address the panel's real objections and apply their best suggestions. Return ONLY JSON.";
  const areas = (body.focusAreas || []).filter(Boolean).slice(0, 5);
  const subjectNoun = body.kind === "anything" ? "a plan / idea someone shared" : def.label.toLowerCase();
  const prompt = `Here is ${subjectNoun}${body.format ? ` (a ${body.format.toLowerCase()})` : ""} that a simulated panel just reviewed.${body.goal ? `\nGoal of the test: ${body.goal}` : ""}${body.context?.trim() ? `\nThe team's situation (the revision must work within this): ${body.context.trim().slice(0, 800)}` : ""}${areas.length ? `\nThe panel was asked to weigh: ${areas.join("; ")} — the revision should visibly strengthen these.` : ""}

TITLE: ${body.subject.title || "(none)"}
BODY:
${body.subject.body || ""}

The panel's biggest concerns:
${(body.concerns || []).slice(0, 4).map((c) => `- ${c}`).join("\n") || "- (none captured)"}

Their top suggestions:
${(body.suggestions || []).slice(0, 4).map((s) => `- ${s}`).join("\n") || "- (none captured)"}

Write a stronger version that keeps the same intent and voice but directly addresses those concerns and applies the best suggestions. Respond with ONLY this JSON (no fences):
{ "title": "revised title (or the same if it's fine)", "body": "the full revised copy" }`;

  let text: string;
  try {
    text = await callModel({ apiKey, model: process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6", maxTokens: 1200, system, messages: [{ role: "user", content: prompt }] });
  } catch (e) {
    void (e instanceof ModelError);
    return NextResponse.json({ draft: heuristicDraft(body), source: "heuristic-fallback" });
  }

  try {
    const p = extractJson<Record<string, unknown>>(text);
    const title = typeof p.title === "string" ? p.title.trim().slice(0, 200) : (body.subject.title || "");
    const draftBody = typeof p.body === "string" && p.body.trim() ? p.body.trim().slice(0, 4000) : heuristicDraft(body).body;
    return NextResponse.json({ draft: { title, body: draftBody }, source: "model" });
  } catch {
    return NextResponse.json({ draft: heuristicDraft(body), source: "heuristic-parse" });
  }
}
