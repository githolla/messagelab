import { NextRequest, NextResponse } from "next/server";
import { industry } from "@/lib/industries";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const maxDuration = 60;

const NOUN: Record<string, string> = {
  email: "marketing email",
  direct_mail: "direct mail letter",
  website: "landing page",
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let industryKey: string | undefined;
  let assetType: string | undefined;
  let messageType: string | undefined;
  try {
    const parsed = (await req.json()) as {
      industry?: string;
      assetType?: string;
      messageType?: string;
    };
    industryKey = parsed.industry;
    assetType = parsed.assetType;
    messageType = parsed.messageType;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const ind = industry(industryKey);
  const noun = NOUN[assetType ?? "email"] ?? "marketing email";
  const industryLine = ind && ind.key !== "general" ? `Industry: ${ind.label}. ${ind.guidance}` : "";
  const mt = (messageType || "marketing").slice(0, 120);

  const user = `Draft two A/B-test versions of a ${mt} ${noun}. ${industryLine}

The two versions must use genuinely DIFFERENT strategies (for example: emotional/story-led vs. concrete offer/numbers-led, or benefit-led vs. urgency-led) so the test is meaningful — not two paraphrases of the same thing.

Each version: a subject line (if email) and a short, realistic body (roughly 60-110 words) ending in a clear call to action. Write it ready to send — no placeholders like [Name] beyond a generic greeting.

Respond with ONLY a JSON object, no markdown fences:
{"labelA": "short strategy name", "copyA": "full version A", "labelB": "short strategy name", "copyB": "full version B"}`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  let text: string;
  try {
    text = await callModel({
      apiKey,
      model,
      maxTokens: 1500,
      system:
        "You are a senior direct-response copywriter. You write tight, specific, ready-to-send copy and design sharp A/B tests with a real strategic contrast between versions.",
      messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    const err = e instanceof ModelError ? e : new ModelError(502, "unknown error");
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  try {
    const draft = extractJson<{ copyA?: string; copyB?: string }>(text);
    if (!draft.copyA || !draft.copyB) {
      return NextResponse.json({ error: "Draft was incomplete." }, { status: 502 });
    }
    return NextResponse.json(draft);
  } catch {
    return NextResponse.json({ error: "Model returned no parseable draft." }, { status: 502 });
  }
}
