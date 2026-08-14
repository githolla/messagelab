import { NextRequest, NextResponse } from "next/server";
import type { RfpEvaluator, RfpInput, RfpResult, RfpVerdict, CriterionKey } from "@/lib/rfp";
import { CRITERIA } from "@/lib/rfp";
import { evaluateRfp } from "@/lib/rfpsim";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

export const maxDuration = 60;

// Score a proposal through the buying committee. The deterministic engine
// (lib/rfpsim) is the demo / no-key path; a key upgrades it to a model read,
// coerced back onto the known criteria/evaluators so bad output can't break the UI.
export async function POST(req: NextRequest) {
  let committee: RfpEvaluator[];
  let input: RfpInput;
  try {
    const parsed = (await req.json()) as { committee: RfpEvaluator[]; input: RfpInput };
    committee = parsed.committee;
    input = parsed.input;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!Array.isArray(committee) || !committee.length) return NextResponse.json({ error: "Add at least one evaluator." }, { status: 400 });
  if (!input?.proposal?.trim()) return NextResponse.json({ error: "Add your proposal / RFP response to evaluate." }, { status: 400 });

  const det = evaluateRfp(committee, input);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ result: det, model: null, demo: true });

  const roster = committee.map((e) => `- ${e.role} (${e.focus}, weight ${Math.round(e.weight * 100)}%): ${e.instruction}`).join("\n");
  const critList = CRITERIA.map((c) => `- ${c.key}: ${c.label} — ${c.blurb}`).join("\n");

  const system = `You are a B2B buying committee evaluating a vendor's RFP response before award. Be a tough, realistic evaluator: reward specific, verifiable answers and penalize vague claims, missing requirements, and unaddressed risk. Never invent facts about the vendor. Score the vendor's real chance of winning THIS deal.`;

  const user = `DEAL
- We are buying: ${input.offering || "(unspecified)"}
- Deal size: ${input.dealSize || "(unspecified)"}
- Likely incumbent/rival: ${input.competitor || "(unknown)"}

BUYING COMMITTEE (each scores from its lens; weights sum to the decision):
${roster}

SCORING CRITERIA (score each 0–100):
${critList}

${input.rfp.trim() ? `THE RFP / REQUIREMENTS:\n${input.rfp}\n\n` : ""}THE VENDOR'S PROPOSAL:
${input.proposal}

Return ONLY this JSON (no markdown fences):
{
  "winScore": 0-100,
  "verdict": "strong" | "competitive" | "longshot" | "rework",
  "headline": "one sentence — the bottom line on this bid",
  "criteria": [ { "key": "fit|differentiation|proof|value|risk|clarity", "score": 0-100, "note": "one line" } ],
  "evaluators": [ { "role": "<role>", "score": 0-100, "verdict": "one line", "concern": "their biggest concern", "wouldWin": "what would win them over" } ],
  "gaps": [ { "text": "a specific gap", "severity": "high|medium|low" } ],
  "actions": [ { "text": "a specific fix to raise win probability", "priority": "high|medium|low" } ]
}`;

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  try {
    const text = await callModel({ apiKey, model, maxTokens: 2000, system, messages: [{ role: "user", content: user }] });
    const parsed = extractJson<Record<string, unknown>>(text);
    return NextResponse.json({ result: coerce(parsed, det), model });
  } catch (e) {
    const detail = e instanceof ModelError ? e.message : "evaluation failed";
    return NextResponse.json({ result: det, model: null, warning: detail });
  }
}

const VERDICTS = new Set(["strong", "competitive", "longshot", "rework"]);
const CRIT_KEYS = new Set(CRITERIA.map((c) => c.key));
const clampN = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fb);
const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.trim() : fb);
const sev = (v: unknown): "high" | "medium" | "low" => (["high", "medium", "low"].includes(v as string) ? (v as "high" | "medium" | "low") : "medium");

// Merge the model's output onto the deterministic result, keeping known shapes.
function coerce(raw: Record<string, unknown>, det: RfpResult): RfpResult {
  const criteria = Array.isArray(raw.criteria)
    ? det.criteria.map((d) => {
        const m = (raw.criteria as Record<string, unknown>[]).find((c) => c.key === d.key);
        return m ? { ...d, score: clampN(m.score, d.score), note: str(m.note, d.note) } : d;
      })
    : det.criteria;

  const evaluators = Array.isArray(raw.evaluators)
    ? det.evaluators.map((d) => {
        const m = (raw.evaluators as Record<string, unknown>[]).find((e) => str(e.role, "") === d.role);
        return m
          ? { ...d, score: clampN(m.score, d.score), verdict: str(m.verdict, d.verdict), concern: str(m.concern, d.concern), wouldWin: str(m.wouldWin, d.wouldWin) }
          : d;
      })
    : det.evaluators;

  const arr = <T,>(v: unknown, map: (x: Record<string, unknown>) => T, fb: T[]) =>
    Array.isArray(v) ? (v as Record<string, unknown>[]).slice(0, 6).map(map) : fb;

  return {
    winScore: clampN(raw.winScore, det.winScore),
    verdict: (VERDICTS.has(raw.verdict as string) ? raw.verdict : det.verdict) as RfpVerdict,
    headline: str(raw.headline, det.headline),
    criteria: criteria.filter((c) => CRIT_KEYS.has(c.key as CriterionKey)),
    evaluators,
    gaps: arr(raw.gaps, (g) => ({ text: str(g.text, ""), severity: sev(g.severity) }), det.gaps).filter((g) => g.text),
    actions: arr(raw.actions, (a) => ({ text: str(a.text, ""), priority: sev(a.priority) }), det.actions).filter((a) => a.text),
  };
}
