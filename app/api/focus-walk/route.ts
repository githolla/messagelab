import { NextRequest, NextResponse } from "next/server";
import type { Sentiment, WalkStep } from "@/lib/focus";
import { SENTIMENTS, kindDef } from "@/lib/focus";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";
import { BrowseSession, type Clickable } from "@/lib/browse";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_STEPS_CAP = 8;
const TIME_BUDGET_MS = 200_000; // stop exploring in time to still synthesize a reaction

const SENT = new Set<string>(SENTIMENTS);
const coerceSent = (v: unknown): Sentiment => (SENT.has(v as string) ? (v as Sentiment) : "neutral");
const coerce15 = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
function imageBlock(dataUrl: string): Block | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : null;
}

interface WalkBody {
  persona: { id: string; name: string; segment: string; how?: string; dims?: Record<string, string> };
  subject: { url: string; industry?: string; title?: string; body?: string };
  maxSteps?: number;
}

const elementList = (cs: Clickable[]) =>
  cs.length
    ? cs.map((c) => `[${c.i}] ${c.tag === "a" ? "link" : c.tag} "${c.text || c.href || "—"}"`).join("\n")
    : "(no clickable elements are on screen — scroll to see more)";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured — live walkthroughs need a model key." },
      { status: 500 }
    );

  let bodyIn: WalkBody;
  try {
    bodyIn = (await req.json()) as WalkBody;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  const { persona, subject } = bodyIn;
  if (!persona?.id || !subject?.url)
    return NextResponse.json({ error: "Request needs a persona and a start URL." }, { status: 400 });

  const maxSteps = Math.max(2, Math.min(MAX_STEPS_CAP, Math.round(bodyIn.maxSteps || 5)));
  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  const def = kindDef("website");
  const dims = persona.dims ? Object.entries(persona.dims).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
  const goal = subject.body?.trim()
    ? ` You came here to: ${subject.body.trim().slice(0, 400)}.`
    : " You're deciding whether this site and its offer are for you.";
  const system = `You are ${persona.name}, a real person in the ${subject.industry || "general"} space. Your type: ${persona.segment}${persona.how ? ` — ${persona.how}` : ""}.${dims ? `\n${dims}` : ""}\nYou are browsing a live website yourself, one action at a time, exactly as this person would — with your own priorities, patience, and skepticism. If it's confusing or not for you, you leave. Stay in character.`;

  const journey: WalkStep[] = [];
  const started = Date.now();
  let session: BrowseSession | null = null;

  try {
    session = await BrowseSession.open();
    try {
      await session.goto(subject.url);
    } catch (e) {
      await session.close();
      return NextResponse.json(
        {
          error: `Couldn't open that URL (${e instanceof Error ? e.message : "unknown error"}). Some sites block headless browsers or need a login — upload screenshots instead.`,
        },
        { status: 502 }
      );
    }
    journey.push({ n: 0, action: "start", url: session.url(), target: await session.pageTitle(), thought: "Landed on the site." });

    for (let step = 1; step <= maxSteps; step++) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const cs = await session.clickables();
      const shot = await session.shot(true);
      const img = imageBlock(shot);
      const title = await session.pageTitle();
      const recap = journey
        .slice(1)
        .map((s) => `${s.n}. ${s.action}${s.target ? ` "${s.target}"` : ""} — ${s.thought}`)
        .join("\n");

      const prompt = `You're on: ${title || "(untitled)"} — ${session.url()}${goal}

On-screen elements you can act on (numbers match the green badges in the screenshot):
${elementList(cs)}
${recap ? `\nWhat you've done so far:\n${recap}` : "\nYou just arrived."}

Pick ONE next action, working toward a decision (convert, or give up):
- {"action":"click","index":N}  — click element N
- {"action":"scroll"}           — see more of this page
- {"action":"back"}             — return to the previous page
- {"action":"done"}             — you've seen enough (you'd act, or you'd leave)

Reply with ONLY JSON: {"thought":"one sentence in your own voice — what you see and why you're doing this","action":"click|scroll|back|done","index":N}`;

      const content: Block[] = img
        ? [{ type: "text", text: prompt }, img]
        : [{ type: "text", text: prompt }];

      let decision: Record<string, unknown>;
      try {
        const text = await callModel({ apiKey, model, maxTokens: 300, system, messages: [{ role: "user", content }] });
        decision = extractJson(text);
      } catch {
        break; // a step failure just ends this walk early; we still synthesize below
      }

      const action = String(decision.action || "done");
      const thought = str(decision.thought) || "…";
      if (action === "done") {
        journey.push({ n: step, action: "done", url: session.url(), thought });
        break;
      } else if (action === "click") {
        const idx = Number(decision.index);
        const target = cs.find((c) => c.i === idx);
        if (!target) {
          await session.scroll();
          journey.push({ n: step, action: "scroll", url: session.url(), thought });
          continue;
        }
        try {
          await session.click(idx);
        } catch {
          /* element vanished — record the intent and move on */
        }
        journey.push({ n: step, action: "click", url: session.url(), target: target.text || target.href, thought });
      } else if (action === "back") {
        await session.back();
        journey.push({ n: step, action: "back", url: session.url(), target: await session.pageTitle(), thought });
      } else {
        await session.scroll();
        journey.push({ n: step, action: "scroll", url: session.url(), thought });
      }
    }

    // ---- Synthesize the reaction from the journey the persona actually took.
    const pages = Array.from(new Set(journey.map((s) => s.url)));
    const trail = journey
      .map((s) => `${s.n}. ${s.action}${s.target ? ` "${s.target}"` : ""} — ${s.thought}`)
      .join("\n");
    const q = `You just spent a few minutes on this website as yourself. The path you took:
${trail}

Pages you saw: ${pages.join(" → ")}

Now give your honest reaction to the EXPERIENCE — the site, its offer, and how it felt to use. Weigh: ${def.lens}.
1. sentiment — one of: "love" | "like" | "neutral" | "skeptical" | "reject".
2. likelihood — how likely YOU are to ${def.verb} (1 = not at all, 5 = definitely).
3. resonates — the ONE thing that most worked for you.
4. concern — your single biggest concern or friction point.
5. question — the first question you'd ask.
6. suggestion — one concrete change that would improve it for you.
7. quote — one sentence in your own voice summing up the visit.

Respond with ONLY this JSON (no markdown fences):
{ "sentiment": "...", "likelihood": 1-5, "resonates": "...", "concern": "...", "question": "...", "suggestion": "...", "quote": "..." }`;

    let p: Record<string, unknown> = {};
    try {
      const text = await callModel({ apiKey, model, maxTokens: 700, system, messages: [{ role: "user", content: q }] });
      p = extractJson(text);
    } catch (e) {
      const err = e instanceof ModelError ? e : new ModelError(502, "unknown error");
      return NextResponse.json({ error: err.message }, { status: 502 });
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
      journey,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Walk failed (${e instanceof Error ? e.message : "unknown error"}).` },
      { status: 502 }
    );
  } finally {
    await session?.close();
  }
}
