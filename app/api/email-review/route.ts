import { NextRequest, NextResponse } from "next/server";
import type { Webinar } from "@/lib/leads";
import type { ReviewAgent, PastEmail, EmailReview, EmailBaseline } from "@/lib/reviewers";
import { reviewAll, buildBaseline } from "@/lib/emailreview";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const maxDuration = 60;

// Review a set of PAST emails through a panel of reviewer agents and distill a
// reusable baseline. The deterministic engine (lib/emailreview) is the fallback
// + demo path; a key upgrades it to a model read of the same emails + agents.
export async function POST(req: NextRequest) {
  let agents: ReviewAgent[];
  let emails: PastEmail[];
  let webinar: Webinar | undefined;
  try {
    const parsed = (await req.json()) as { agents: ReviewAgent[]; emails: PastEmail[]; webinar?: Webinar };
    agents = parsed.agents;
    emails = parsed.emails;
    webinar = parsed.webinar;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!Array.isArray(agents) || !agents.length) return NextResponse.json({ error: "Add at least one review agent." }, { status: 400 });
  const usable = (emails || []).filter((e) => (e.body || "").trim().length > 0);
  if (!usable.length) return NextResponse.json({ error: "Add at least one email with body text to review." }, { status: 400 });

  const detReviews = reviewAll(agents, usable);
  const detBaseline = buildBaseline(detReviews, usable);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reviews: detReviews, baseline: detBaseline, model: null, demo: true });
  }

  const agentList = agents.map((a) => `- ${a.name} (${a.focus}): ${a.instruction}`).join("\n");
  const emailList = usable
    .map((e, i) => `EMAIL ${i + 1} [id=${e.id}] (${e.label})\nSubject: ${e.subject}\n${e.body}`)
    .join("\n\n---\n\n");

  const system = `You are a panel of expert email reviewers auditing an organization's PAST outreach emails so their future emails can be built on what already works. ${webinar?.topic ? `Context: these relate to "${webinar.topic}" outreach. ` : ""}Be specific and honest. Every fix must be concrete and actionable. Never invent facts about the sender or recipients.`;

  const user = `REVIEW AGENTS (each scores from its own lens):
${agentList}

Score every email 0–100 through EACH agent's lens, with 1–3 concrete strengths and 1–4 concrete fixes (each fix tagged severity high|medium|low). Then distill ONE baseline the drafting should follow.

${emailList}

Respond with ONLY this JSON (no markdown fences):
{
  "reviews": [
    { "emailId": "<id>", "critiques": [
      { "agentId": "<agent id>", "score": 0-100, "read": "one line", "strengths": ["…"], "fixes": [{"text":"…","severity":"high|medium|low"}] }
    ] }
  ],
  "baseline": { "voice": "…", "dos": ["…"], "donts": ["…"], "structure": ["…"], "subjectTips": ["…"] }
}`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  try {
    const text = await callModel({
      apiKey,
      model,
      maxTokens: 2200,
      system,
      messages: [{ role: "user", content: user }],
    });
    const parsed = extractJson<{ reviews?: unknown; baseline?: Record<string, unknown> }>(text);
    const merged = mergeReviews(agents, usable, detReviews, parsed.reviews);
    const baseline = coerceBaseline(parsed.baseline, detBaseline, usable.length, merged);
    return NextResponse.json({ reviews: merged, baseline, model });
  } catch (e) {
    const detail = e instanceof ModelError ? e.message : "review generation failed";
    return NextResponse.json({ reviews: detReviews, baseline: detBaseline, model: null, warning: detail });
  }
}

// Coerce the model's per-email/per-agent output onto the known agents+emails,
// falling back to the deterministic critique for anything missing/malformed.
function mergeReviews(
  agents: ReviewAgent[],
  emails: PastEmail[],
  det: EmailReview[],
  raw: unknown,
): EmailReview[] {
  const byEmail = new Map<string, Record<string, unknown>>();
  if (Array.isArray(raw))
    for (const r of raw as Record<string, unknown>[]) {
      const id = typeof r.emailId === "string" ? r.emailId : "";
      const cs = Array.isArray(r.critiques) ? (r.critiques as Record<string, unknown>[]) : [];
      const m: Record<string, unknown> = {};
      for (const c of cs) if (typeof c.agentId === "string") m[c.agentId] = c;
      byEmail.set(id, m);
    }

  return emails.map((e, i) => {
    const detReview = det[i];
    const modelCrits = byEmail.get(e.id) || {};
    const critiques = agents.map((a) => {
      const detC = detReview.critiques.find((c) => c.agentId === a.id)!;
      const mc = modelCrits[a.id] as Record<string, unknown> | undefined;
      if (!mc) return detC;
      const score = typeof mc.score === "number" ? Math.max(0, Math.min(100, Math.round(mc.score))) : detC.score;
      const strengths = Array.isArray(mc.strengths) ? (mc.strengths as unknown[]).filter((x) => typeof x === "string").slice(0, 3) as string[] : detC.strengths;
      const fixes = Array.isArray(mc.fixes)
        ? (mc.fixes as Record<string, unknown>[])
            .filter((f) => typeof f.text === "string")
            .slice(0, 4)
            .map((f) => ({ text: f.text as string, severity: (["high", "medium", "low"].includes(f.severity as string) ? f.severity : "medium") as "high" | "medium" | "low" }))
        : detC.fixes;
      const read = typeof mc.read === "string" && mc.read.trim() ? mc.read.trim() : detC.read;
      return { agentId: a.id, agentName: a.name, score, read, strengths, fixes };
    });
    const overall = Math.round(critiques.reduce((t, c) => t + c.score, 0) / (critiques.length || 1));
    return { emailId: e.id, label: e.label, subject: e.subject, overall, critiques };
  });
}

function coerceBaseline(raw: Record<string, unknown> | undefined, det: EmailBaseline, count: number, reviews: EmailReview[]): EmailBaseline {
  const arr = (v: unknown, fb: string[]) =>
    Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === "string" && x.trim()).slice(0, 6) as string[] : fb;
  const avgScore = Math.round(reviews.reduce((t, r) => t + r.overall, 0) / (reviews.length || 1));
  if (!raw) return { ...det, emailsReviewed: count, avgScore };
  return {
    voice: typeof raw.voice === "string" && raw.voice.trim() ? raw.voice.trim() : det.voice,
    dos: arr(raw.dos, det.dos),
    donts: arr(raw.donts, det.donts),
    structure: arr(raw.structure, det.structure),
    subjectTips: arr(raw.subjectTips, det.subjectTips),
    emailsReviewed: count,
    avgScore,
  };
}
