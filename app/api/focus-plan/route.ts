import { NextRequest, NextResponse } from "next/server";
import { INDUSTRIES } from "@/lib/industries";
import { FOCUS_KINDS, type FocusKind } from "@/lib/focus";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

const FORMATS = ["Email", "Direct mail", "Social post", "Landing page", "Ad / banner", "Pitch deck", "One-pager", ""];
const KIND_KEYS = FOCUS_KINDS.map((k) => k.key);
const IND_KEYS = INDUSTRIES.map((i) => i.key);

export interface StudyPlan {
  kind: FocusKind;
  industry: string;
  format: string;
  title: string;
  body: string;
  goal: string;
}

// Deterministic keyword plan when there's no API key — good enough to unblock.
function heuristicPlan(goal: string): StudyPlan {
  const g = goal.toLowerCase();
  const has = (...w: string[]) => w.some((x) => g.includes(x));
  // Default to the open kind — anything without a clear business shape goes to
  // the room as-is ("I want to eat steak tonight" is a valid subject).
  let kind: FocusKind = "anything";
  if (has("landing", "website", "home page", "homepage", "web page", "site")) kind = "website";
  else if (has("go-to-market", "go to market", "gtm", "launch", "positioning", "channel")) kind = "gtm";
  else if (has("sales", "pitch", "deal", "close", "proposal")) kind = "sales";
  else if (has("social", "instagram", "tiktok", "linkedin", "post", "reel")) kind = "social";
  else if (has("brand", "logo", "identity", "creative")) kind = "brand";
  else if (has("concept", "tagline", "positioning statement", "name")) kind = "concept";
  else if (has("product", "feature", "app", "prototype", "mvp", "tool", "device")) kind = "product";

  let format = "";
  if (has("email", "newsletter")) format = "Email";
  else if (has("direct mail", "letter", "mailer", "postcard")) format = "Direct mail";
  else if (has("social", "post", "caption")) format = "Social post";
  else if (has("landing", "web page", "homepage")) format = "Landing page";
  else if (has("ad", "banner")) format = "Ad / banner";
  else if (has("deck", "pitch deck", "slides")) format = "Pitch deck";

  const ind = INDUSTRIES.find((i) => i.key !== "general" && g.includes(i.label.toLowerCase().split(" / ")[0]))?.key
    || (has("donor", "nonprofit", "fundrais") ? "nonprofit" : "")
    || (has("saas", "software", "b2b") ? "saas" : "")
    || "general";

  return {
    kind,
    industry: IND_KEYS.includes(ind) ? ind : "general",
    format,
    title: "",
    body: kind === "anything"
      ? goal.trim()
      : `We're testing something to answer: ${goal.trim()}. Describe what the room should react to here…`,
    goal: goal.trim(),
  };
}

export async function POST(req: NextRequest) {
  let goal = "";
  try {
    const parsed = (await req.json()) as { goal?: string };
    goal = parsed.goal ?? "";
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!goal || !goal.trim()) return NextResponse.json({ error: "Tell us what you're trying to learn." }, { status: 400 });
  goal = goal.trim().slice(0, 500);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ plan: heuristicPlan(goal), source: "heuristic" });

  const system =
    "You design a simulated focus-group study from a plain-language business question. You choose the best subject type, industry, and asset format, and draft the thing to test. Return ONLY JSON.";
  const prompt = `The user wants to learn: "${goal}"

Pick the best setup and draft a first-pass subject to put in front of a persona-agent panel.

kind — one of: ${KIND_KEYS.join(" | ")}
industry — one of these keys: ${IND_KEYS.join(" | ")}
format — one of: ${FORMATS.filter(Boolean).join(" | ")} (or "" if none fits)

Anything is fair game. If it's a personal or everyday thing rather than a business asset (e.g. "I want to eat steak tonight", "should I move cities"), use kind "anything", industry "general", format "", and make the body a clear plain-language statement of the plan or idea for the room to react to.

Respond with ONLY this JSON (no fences):
{ "kind": "...", "industry": "...", "format": "...", "title": "short name for the thing being tested", "body": "a concrete 2-4 sentence first draft of the subject the panel will react to, aimed at answering the question" }`;

  let text: string;
  try {
    text = await callModel({ apiKey, model: process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6", maxTokens: 600, system, messages: [{ role: "user", content: prompt }] });
  } catch (e) {
    // Fall back rather than fail the whole intake.
    void (e instanceof ModelError);
    return NextResponse.json({ plan: heuristicPlan(goal), source: "heuristic-fallback" });
  }

  try {
    const p = extractJson<Record<string, unknown>>(text);
    const kind = (KIND_KEYS as string[]).includes(p.kind as string) ? (p.kind as FocusKind) : heuristicPlan(goal).kind;
    const industry = IND_KEYS.includes(p.industry as string) ? (p.industry as string) : "general";
    const format = FORMATS.includes(p.format as string) ? (p.format as string) : "";
    const title = typeof p.title === "string" ? p.title.trim().slice(0, 140) : "";
    const body = typeof p.body === "string" && p.body.trim() ? p.body.trim().slice(0, 2000) : heuristicPlan(goal).body;
    return NextResponse.json({ plan: { kind, industry, format, title, body, goal }, source: "model" });
  } catch {
    return NextResponse.json({ plan: heuristicPlan(goal), source: "heuristic-parse" });
  }
}
