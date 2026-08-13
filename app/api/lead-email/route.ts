import { NextRequest, NextResponse } from "next/server";
import type { Lead, Webinar } from "@/lib/leads";
import { strategyById } from "@/lib/leads";
import { draftEmail } from "@/lib/leademail";
import type { EmailBaseline } from "@/lib/reviewers";
import { baselineToPrompt } from "@/lib/emailreview";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const maxDuration = 60;

// Draft the recommended follow-up in Diane's voice. The deterministic draft
// (lib/leademail) is the fallback + the demo path; when a key is present we ask
// the model to write a sharper version for the SAME lead + strategy so the
// recommendation still drives the copy.
export async function POST(req: NextRequest) {
  let lead: Lead;
  let webinar: Webinar;
  let strategyId: string;
  let baseline: EmailBaseline | undefined;
  try {
    const parsed = (await req.json()) as { lead: Lead; webinar: Webinar; strategyId: string; baseline?: EmailBaseline };
    lead = parsed.lead;
    webinar = parsed.webinar;
    strategyId = parsed.strategyId;
    baseline = parsed.baseline;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!lead?.id || !webinar?.id || !strategyId) {
    return NextResponse.json({ error: "Request must include lead, webinar and strategyId." }, { status: 400 });
  }

  const strategy = strategyById(strategyId);
  const fallback = draftEmail(lead, strategy, webinar);

  // "wait" has no email to write.
  if (strategy.id === "wait") return NextResponse.json({ ...fallback, model: null });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Demo / no-key: return the deterministic draft rather than erroring.
    return NextResponse.json({ ...fallback, model: null, demo: true });
  }

  const signals = [
    lead.attended ? `attended ${lead.pctAttended}% of the webinar` : "did not attend live",
    lead.stayedToEnd ? "stayed to the end" : null,
    lead.questionsAsked > 0 ? `asked ${lead.questionsAsked} question(s)` : null,
    lead.surveyCompleted ? `completed the survey${lead.surveyInterest ? ` (flagged: ${lead.surveyInterest})` : ""}` : null,
    lead.resourcesDownloaded > 0 ? `downloaded ${lead.resourcesDownloaded} resource(s)` : null,
    lead.priorWebinars > 0 ? `attended ${lead.priorWebinars} prior webinar(s)` : null,
    lead.relationship !== "none" ? `existing ${lead.relationship}` : "no prior relationship",
    lead.targetAccount ? "target account" : null,
    `most engaged with: ${lead.topicSignal}`,
  ]
    .filter(Boolean)
    .join("; ");

  const system = `You are Diane Roberts, a senior fundraising strategist at Allegiance Group + Pursuant (AGP), writing a personal follow-up to a nonprofit-fundraising professional who attended one of AGP's webinars. Your voice is warm, concrete, peer-to-peer, and never salesy. You write short emails (120–160 words), no jargon, no hype, one clear purpose. You never fabricate specific data, names, or commitments.`;

  // If the user has reviewed their past emails, condition the draft on the
  // distilled baseline so new emails build on what already works for them.
  const baselineBlock =
    baseline && (baseline.dos?.length || baseline.donts?.length)
      ? `\n\nBASELINE — follow this house style learned from the team's own best past emails:\n${baselineToPrompt(baseline)}`
      : "";

  const user = `Write ONE follow-up email using this strategy:
STRATEGY: ${strategy.name} — ${strategy.blurb}

RECIPIENT
- Name: ${lead.name}
- Title: ${lead.title}, ${lead.company}
- Webinar: "${webinar.title}" (topic: ${webinar.topic})
- Behavior signals: ${signals}

Guidance:
- Ground the personalization in the signals above (what they engaged with), not generic flattery.
- Match the strategy exactly: ${strategy.blurb}
- ${strategy.pushiness >= 0.8 ? "It is a meeting request, but keep it low-friction and specific." : strategy.pushiness <= 0.15 ? "Make NO ask — this is a low-pressure touch." : "Make at most one soft ask or question."}
- Sign as "Diane Roberts, Allegiance Group + Pursuant".${baselineBlock}

Respond with ONLY a JSON object, no markdown fences:
{ "subject": "…", "body": "…with real line breaks…" }`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  try {
    const text = await callModel({
      apiKey,
      model,
      maxTokens: 700,
      system,
      messages: [{ role: "user", content: user }],
    });
    const parsed = extractJson<{ subject?: unknown; body?: unknown }>(text);
    const subject = typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim() : fallback.subject;
    const body = typeof parsed.body === "string" && parsed.body.trim() ? parsed.body : fallback.body;
    return NextResponse.json({ subject, body, model });
  } catch (e) {
    // Surface nothing scary to Diane — fall back to the deterministic draft.
    const detail = e instanceof ModelError ? e.message : "draft generation failed";
    return NextResponse.json({ ...fallback, model: null, warning: detail });
  }
}
