"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetType, Persona, PersonaResult, Variants } from "@/lib/types";
import { ASSET_LABELS, INTENT_LABELS, segmentLabel } from "@/lib/types";
import { demoResult } from "@/lib/demo";
import { tally, GIVE_INTENTS, type RoundSummary } from "@/lib/refine";
import { wilson, shareWithCI } from "@/lib/stats";
import { INDUSTRIES } from "@/lib/industries";
import { ANALYSTS, monogram, messageAudienceKey, personaName, memberNo, autoSegments, scaleSegments, type PanelSegment } from "@/lib/archetypes";
import { demoAnalysis, VERDICT_LABEL, type Analysis } from "@/lib/analysis";
import { sampleFor, isPristineCopy, MESSAGE_TYPES, messageTypesFor } from "@/lib/samples";
import { estimateRunCost, formatCost } from "@/lib/util";
import {
  FACET_GROUPS,
  emptyCohort,
  cohortIsEmpty,
  cohortSummary,
  personaDemographics,
  cohortConditioning,
  type CohortFacets,
  type FacetKey,
} from "@/lib/cohort";
import { buildRunExport, runToMarkdown, type ExportInput } from "@/lib/export";
import { DiffView } from "@/components/Diff";

const CONCURRENCY = 4;
const MAX_REFINE_ROUNDS = 10;

// Panel size presets — a lever for the "too close to call" state (finding: the
// tool used to diagnose insufficient power with no way to add power).
// Panel-size presets for the audience builder. The number is the panel you're
// modelling; live model runs simulate a representative sample capped at LIVE_MAX
// (cost/time), while demo mode simulates the whole panel instantly.
const PANEL_SIZES = [
  { label: "Focus group", n: 12 },
  { label: "Panel", n: 48 },
  { label: "Audience", n: 250 },
  { label: "Big panel", n: 1000 },
] as const;
const DEFAULT_TOTAL = 48;
const LIVE_MAX = 120; // most reactions a live (API) run will actually simulate
const DEMO_MAX = 1000; // hard cap on a modelled panel
const DISPLAY_MAX = 120; // cap on how many individual reactions the list renders

const ASSET_HINTS: Record<AssetType, string> = {
  email: "Paste the two versions you want to test. Replace the sample copy with your own — subject line and body.",
  direct_mail:
    "Paste the two letter versions. Include everything the recipient would read — headline, body, PS, reply-device copy.",
  social:
    "Paste the two post versions — the caption/body as it would appear in-feed, plus any hook line, hashtags, or CTA.",
  website:
    "Upload a screenshot of each page version. A focused capture (hero, primary CTA, key section) reads better than a very tall full-page one.",
};

type PanelMember = { persona: Persona; base: number };

// Build the fan-out list from the user's audience segments: `count` individuals
// per segment, each conditioned on that segment's archetype + description.
function buildPanelFromSegments(
  segs: PanelSegment[],
  facets: CohortFacets,
  cohortText: string
): PanelMember[] {
  const out: PanelMember[] = [];
  for (const s of segs) {
    for (let i = 0; i < s.count; i++) {
      const id = `${s.id}:${i}`;
      const demo = personaDemographics(id, facets);
      out.push({
        base: s.base,
        persona: {
          id,
          name: personaName(id),
          giving: s.name,
          age: demo.age,
          dimensions: {
            archetype: s.name,
            how_they_judge: s.how,
            ...cohortConditioning(demo, cohortText),
            note: "You are one specific individual of this type — bring your own quirks, mood, and priorities. Do not answer as a generic average.",
          },
        },
      });
    }
  }
  return out;
}

// Downscale to Claude's vision sweet spot (long edge ≤ 1568px), re-encode JPEG.
// 0.8 quality for screenshots keeps text legible while trimming the payload
// that gets re-sent once per persona in the fan-out.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Could not read that image file."));
    };
    img.src = URL.createObjectURL(file);
  });
}

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [industry, setIndustry] = useState("general");
  const [variants, setVariants] = useState<Variants>(() => {
    const s = sampleFor("general");
    return { assetType: "email", labelA: s.labelA, labelB: s.labelB, copyA: s.copyA, copyB: s.copyB };
  });
  const [messageType, setMessageType] = useState(MESSAGE_TYPES[0]);
  const [cohort, setCohort] = useState<CohortFacets>(emptyCohort);
  const [cohortText, setCohortText] = useState("");
  // The cohort actually used for the shown run (so displayed demographics stay
  // stable even if the builder is edited afterward).
  const [ranFacets, setRanFacets] = useState<CohortFacets>(emptyCohort);
  const [ranCohortText, setRanCohortText] = useState("");
  const [drafting, setDrafting] = useState(false);

  function toggleFacet(key: FacetKey, opt: string) {
    setCohort((c) => {
      const cur = c[key];
      return { ...c, [key]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
    });
  }
  // Whether the current copy came from Auto-craft (vs a sample or the user's own).
  const [autoCrafted, setAutoCrafted] = useState(false);

  // Switch industries. Browsing the panel is now free and non-destructive: we
  // never auto-fire a paid re-draft — the user re-crafts explicitly. If the copy
  // is still an untouched sample, swap in the new industry's sample; otherwise
  // leave the user's copy alone.
  function changeIndustry(key: string) {
    setIndustry(key);
    const list = messageTypesFor(key);
    const mt = list.includes(messageType) ? messageType : list[0];
    setMessageType(mt);
    setVariants((v) => {
      if (isPristineCopy(v.copyA) && isPristineCopy(v.copyB)) {
        const s = sampleFor(key);
        return { ...v, labelA: s.labelA, labelB: s.labelB, copyA: s.copyA, copyB: s.copyB };
      }
      return v;
    });
  }

  async function autoCraft(overrideIndustry?: string, overrideMsgType?: string) {
    const ind = overrideIndustry ?? industry;
    const mt = overrideMsgType ?? messageType;
    setDrafting(true);
    setError(null);
    try {
      const resp = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ industry: ind, assetType: variants.assetType, messageType: mt }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      pushHistory("Before auto-craft", variants);
      setVariants((v) => ({
        ...v,
        labelA: data.labelA || v.labelA,
        copyA: data.copyA,
        labelB: data.labelB || v.labelB,
        copyB: data.copyB,
      }));
      setAutoCrafted(true);
      addSpend(0.02);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Auto-craft failed") +
          " — you can edit the sample copy or paste your own instead."
      );
    } finally {
      setDrafting(false);
    }
  }

  // Grow a copy textarea to fit its content. useCallback gives the ref a stable
  // identity so React only calls it on mount (not every render); growth while
  // typing is driven from the textarea's own onChange.
  const autoSize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 150) + "px";
  }, []);
  function resizeTa(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 150) + "px";
  }

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [panelSize, setPanelSize] = useState(0);
  const [results, setResults] = useState<PersonaResult[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsAsset, setResultsAsset] = useState<AssetType>("email");
  // Snapshot of the variants actually tested, so results describe the message
  // the panel saw even if the user edits a label/copy afterward.
  const [ranVariants, setRanVariants] = useState<Variants | null>(null);
  const [ranIndustry, setRanIndustry] = useState("general");
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reactVote, setReactVote] = useState<"all" | "send_a" | "send_b" | "either" | "neither">("all");
  const [reactSeg, setReactSeg] = useState<string>("all");
  const [openP, setOpenP] = useState<PersonaResult | null>(null);
  const [detailView, setDetailView] = useState<"cards" | "table">("cards");
  const [sessionSpend, setSessionSpend] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  // Prior versions of the two messages (newest first), captured on each change.
  const [history, setHistory] = useState<{ id: number; note: string; v: Variants }[]>([]);
  const histId = useRef(0);
  // Two-screen flow: the setup screen, then a dedicated results screen the run
  // navigates to on completion (so setup and results are never one long page).
  const [view, setView] = useState<"setup" | "results">("setup");

  const addSpend = (d: number) => setSessionSpend((s) => s + d);

  function pushHistory(note: string, snap: Variants) {
    if (!snap.copyA && !snap.copyB) return; // don't snapshot an empty start
    setHistory((h) => [{ id: (histId.current += 1), note, v: snap }, ...h].slice(0, 12));
  }
  function restoreVariant(entry: { v: Variants }) {
    pushHistory("Before restore", variants);
    setVariants(entry.v);
    setAutoCrafted(false);
  }
  const stopRef = useRef(false);

  // The editable audience panel — auto-filled from industry + message type, then
  // adjustable (counts, names, add/remove) by the user before running.
  const [segments, setSegments] = useState<PanelSegment[]>(() => autoSegments(industry, messageType, DEFAULT_TOTAL));
  const [ranSegments, setRanSegments] = useState<PanelSegment[]>([]);
  // Re-auto-fill when the audience context changes, preserving the chosen total.
  useEffect(() => {
    setSegments((prev) => autoSegments(industry, messageType, prev.reduce((t, s) => t + s.count, 0) || DEFAULT_TOTAL));
  }, [industry, messageType]);

  const msgTypes = useMemo(() => messageTypesFor(industry), [industry]);
  const plannedSize = segments.reduce((t, s) => t + s.count, 0);
  const liveSize = Math.min(plannedSize, LIVE_MAX);
  const industryLabel = INDUSTRIES.find((i) => i.key === industry)?.label ?? "your market";

  function resizePanel(total: number) {
    setSegments((prev) => scaleSegments(prev, Math.max(prev.length, Math.min(DEMO_MAX, total))));
  }
  function setSegCount(id: string, n: number) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, count: Math.max(0, Math.min(DEMO_MAX, Math.round(n) || 0)) } : s)));
  }
  function editSeg(id: string, patch: Partial<PanelSegment>) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSeg(id: string) {
    setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  function addSeg() {
    setSegments((prev) => [
      ...prev,
      { id: `custom-${prev.length}-${prev.reduce((t, s) => t + s.count, 0)}`, name: "New segment", how: "Describe who they are and what they care about", base: 0.5, count: Math.max(1, Math.round((prev.reduce((t, s) => t + s.count, 0) || DEFAULT_TOTAL) / (prev.length + 1))) },
    ]);
  }

  // One member reaction: real API call, with a deterministic demo fallback on
  // failure so a partial outage still fills the panel.
  async function reactOnce(
    m: PanelMember,
    v: Variants,
    leanKey: string,
    onFail: (msg: string) => void
  ): Promise<PersonaResult> {
    try {
      const resp = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: m.persona, variants: v }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      return data as PersonaResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      onFail(msg);
      return { ...demoResult(m.persona, m.base, leanKey), personaId: m.persona.id, error: msg };
    }
  }

  function failMessage(failCount: number, total: number, firstError: string): string {
    return (
      `${failCount} of ${total} reactions failed. First error: ${firstError}` +
      (/credit balance|billing|quota|insufficient/i.test(firstError)
        ? " — this Anthropic account is out of credits. Add credits at console.anthropic.com → Plans & Billing. (Demo mode works without credits.)"
        : /\b401\b|not configured|authentication|invalid.*key/i.test(firstError)
          ? " — check ANTHROPIC_API_KEY in Vercel settings."
          : /\b429\b|rate|overload|\b529\b/i.test(firstError)
            ? " — the API is rate-limiting; wait a moment and re-run (the app retries automatically)."
            : "")
    );
  }

  // Concurrent fan-out over a member list. Order-preserving (pooledMap indexes
  // by position) and commits results once at the end to avoid ~20 full re-renders.
  async function fanOut(members: PanelMember[], v: Variants): Promise<PersonaResult[]> {
    const { pooledMap } = await import("@/lib/run");
    const leanKey = `${v.copyA}|${v.copyB}`;
    let firstError = "";
    let failCount = 0;
    const onFail = (msg: string) => {
      failCount++;
      if (!firstError) firstError = msg;
      setError(failMessage(failCount, members.length, firstError));
    };
    const settled = await pooledMap(
      members,
      (m) => reactOnce(m, v, leanKey, onFail),
      { concurrency: CONCURRENCY, onSettle: () => setDone((d) => d + 1) }
    );
    return settled.filter((r): r is PersonaResult => !!r && !r.error);
  }

  async function runPanel(v: Variants): Promise<PersonaResult[]> {
    // Live runs simulate a representative sample of the panel, capped for cost.
    const liveSegs = scaleSegments(segments, liveSize);
    const members = buildPanelFromSegments(liveSegs, cohort, cohortText);
    setRunning(true);
    setResultsAsset(v.assetType);
    setRanVariants(v);
    setRanIndustry(industry);
    setRanSegments(segments);
    setRanFacets(cohort);
    setRanCohortText(cohortText);
    setError(null);
    setResults([]);
    setIsDemo(false);
    setDone(0);
    setPanelSize(members.length);
    const clean = await fanOut(members, v);
    setResults(clean);
    setRunning(false);
    addSpend(estimateRunCost(members.length, false));
    return clean;
  }

  async function analyze(v: Variants, res: PersonaResult[]): Promise<Analysis | null> {
    if (!res.length) return null;
    setAnalyzing(true);
    setAnalysis(null);
    let out: Analysis;
    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variants: v, results: res, industry }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      out = data.analysis as Analysis;
      addSpend(0.03);
    } catch {
      // Fall back to the deterministic analysis so the report still renders.
      out = demoAnalysis(v, res);
    } finally {
      setAnalyzing(false);
    }
    setAnalysis(out);
    return out;
  }

  function markGenerated(res: PersonaResult[]) {
    if (!res.length) return;
    setGeneratedAt(new Date().toISOString());
  }

  async function runLive() {
    if (variants.assetType === "website" && (!variants.imageA || !variants.imageB)) {
      setError("Upload a screenshot for both versions before running.");
      return;
    }
    // Guard against spending money on nothing: pristine sample, empty, or
    // identical copy. (Website copy lives in the images, so only check text.)
    if (variants.assetType !== "website") {
      const a = variants.copyA.trim();
      const b = variants.copyB.trim();
      if (!a || !b) {
        setError("Add copy for both versions before running a live test.");
        return;
      }
      if (isPristineCopy(variants.copyA) && isPristineCopy(variants.copyB)) {
        if (
          !window.confirm(
            "You're about to test the built-in sample copy — replace it with your own first, or run the demo to see how results look. Run the sample anyway?"
          )
        )
          return;
      } else if (a === b) {
        if (
          !window.confirm(
            "Both versions are identical — an A/B test can't separate them. Run anyway?"
          )
        )
          return;
      }
    }
    setRounds([]);
    setRefineNote(null);
    setAnalysis(null);
    const res = await runPanel(variants);
    goToResults();
    setRounds([{ labelA: variants.labelA, labelB: variants.labelB, ...tally(res) }]);
    const a = await analyze(variants, res);
    markGenerated(res);
  }

  function runDemo() {
    setError(null);
    setIsDemo(true);
    // Demo is deterministic + free, so it simulates the whole modelled panel.
    const demoSegs = plannedSize > DEMO_MAX ? scaleSegments(segments, DEMO_MAX) : segments;
    const members = buildPanelFromSegments(demoSegs, cohort, cohortText);
    const leanKey = `${variants.copyA}|${variants.copyB}`;
    const res = members.map((m) => demoResult(m.persona, m.base, leanKey));
    setResultsAsset(variants.assetType);
    setRanVariants(variants);
    setRanIndustry(industry);
    setRanSegments(segments);
    setRanFacets(cohort);
    setRanCohortText(cohortText);
    setResults(res);
    setPanelSize(members.length);
    setDone(members.length);
    setRefineNote(null);
    setRounds([{ labelA: variants.labelA, labelB: variants.labelB, ...tally(res) }]);
    const a = demoAnalysis(variants, res);
    setAnalysis(a);
    markGenerated(res);
    goToResults();
  }

  // Add another standard panel to the current results — the lever to fix a
  // "too close to call" verdict by adding statistical power to the same copy.
  async function addMoreReactions() {
    const v = ranVariants ?? variants;
    if (isDemo) return;
    const topUp = scaleSegments(ranSegments.length ? ranSegments : segments, Math.min(LIVE_MAX, 24));
    const members = buildPanelFromSegments(topUp, ranFacets, ranCohortText);
    setRunning(true);
    setError(null);
    setDone(0);
    setPanelSize(members.length);
    const existing = results;
    const clean = await fanOut(members, v);
    const merged = [...existing, ...clean];
    setResults(merged);
    setRunning(false);
    addSpend(estimateRunCost(members.length, false));
    setRounds((rs) =>
      rs.length
        ? rs.map((r, i) => (i === rs.length - 1 ? { labelA: v.labelA, labelB: v.labelB, ...tally(merged) } : r))
        : [{ labelA: v.labelA, labelB: v.labelB, ...tally(merged) }]
    );
    const a = await analyze(v, merged);
    markGenerated(merged);
  }

  async function refineLoop() {
    stopRef.current = false;
    setRefining(true);
    let v = ranVariants ?? variants;
    let res = results;
    let outcome: string | null = null;
    const startTally = tally(res);
    let bestGive = Math.max(startTally.givesA, startTally.givesB);
    let bestLabel = startTally.givesA >= startTally.givesB ? v.labelA : v.labelB;
    let ranAny = false;

    for (let i = 0; i < MAX_REFINE_ROUNDS; i++) {
      if (stopRef.current) {
        outcome = `Stopped after ${i} round${i === 1 ? "" : "s"}. Best so far: "${bestLabel}" at ${bestGive}/${res.length} would convert.`;
        break;
      }
      // Soft cost confirm before the loop gets expensive.
      if (i === 3 && !window.confirm(
        `You've run 3 refine rounds (${formatCost(sessionSpend)} so far this session). Each further round re-runs the full panel plus a redraft. Keep refining?`
      )) {
        outcome = `Stopped at your request after 3 rounds. Best so far: "${bestLabel}" at ${bestGive}/${res.length} would convert.`;
        break;
      }
      setRefineNote("Analyzing results and drafting a challenger…");
      let draft: { diagnosis: string; label: string; copy: string; champion: "a" | "b" };
      try {
        const resp = await fetch("/api/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variants: v, results: res }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        draft = data;
        addSpend(0.03);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Refinement failed.");
        outcome = `Refinement stopped on an error. Best so far: "${bestLabel}" at ${bestGive}/${res.length} would convert.`;
        break;
      }
      setRounds((rs) =>
        rs.map((r, idx) => (idx === rs.length - 1 ? { ...r, diagnosis: draft.diagnosis } : r))
      );

      const champLabel = draft.champion === "a" ? v.labelA : v.labelB;
      const next: Variants =
        draft.champion === "a"
          ? { ...v, labelB: draft.label, copyB: draft.copy }
          : { ...v, labelA: draft.label, copyA: draft.copy };
      pushHistory(`Before refine round ${i + 1}`, v);
      setVariants(next);
      setRefineNote(
        `Round ${i + 2} of up to ${MAX_REFINE_ROUNDS + 1}: testing "${draft.label}" against "${champLabel}"…`
      );

      const newRes = await runPanel(next);
      ranAny = true;
      const t = tally(newRes);
      const changed: "A" | "B" = draft.champion === "a" ? "B" : "A";
      const roundDraft = {
        version: changed,
        prevLabel: changed === "A" ? v.labelA : v.labelB,
        prevCopy: changed === "A" ? v.copyA : v.copyB,
        newLabel: draft.label,
        newCopy: draft.copy,
      };
      setRounds((rs) => [...rs, { labelA: next.labelA, labelB: next.labelB, ...t, draft: roundDraft }]);
      v = next;
      res = newRes;

      const roundGive = Math.max(t.givesA, t.givesB);
      const roundLabel = t.givesA >= t.givesB ? next.labelA : next.labelB;
      if (roundGive > bestGive) {
        bestGive = roundGive;
        bestLabel = roundLabel;
        setRefineNote(`"${roundLabel}" raised conversions to ${roundGive} of ${newRes.length} — new best, refining again…`);
        if (i === MAX_REFINE_ROUNDS - 1) {
          outcome = `Round budget reached (${MAX_REFINE_ROUNDS} rounds). Still improving — best is "${bestLabel}" at ${bestGive}/${newRes.length} would convert. Run auto-refine again to keep going.`;
        }
        continue;
      }
      outcome = `Plateau reached: round ${i + 2} (${roundGive}/${newRes.length}) did not beat the best conversion count (${bestGive}/${newRes.length}). Ready version: "${bestLabel}".`;
      break;
    }

    if (!outcome && !ranAny) outcome = "Nothing to refine yet — run a test first.";
    // Re-analyze the final panel so the report reflects the refined winner.
    if (ranAny) {
      const a = await analyze(v, res);
      markGenerated(res);
    }
    setRefineNote(outcome);
    setRefining(false);
  }

  // Navigate to the dedicated results screen and start it at the top.
  function goToResults() {
    setView("results");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }

  // ---- Derived counts (one source of truth: GIVE_INTENTS) ----
  const winners = {
    a: results.filter((r) => r.winner === "send_a").length,
    b: results.filter((r) => r.winner === "send_b").length,
  };
  const givers = (k: "intentA" | "intentB") =>
    results.filter((r) => GIVE_INTENTS.includes(r[k])).length;

  const n = results.length || 1;
  const gA = givers("intentA");
  const gB = givers("intentB");
  const mean = (key: "resonanceA" | "resonanceB") =>
    results.length ? results.reduce((s, r) => s + (r[key] || 0), 0) / results.length : 0;
  const trustA = results.filter((r) => r.trust === "version_a").length;
  const trustB = results.filter((r) => r.trust === "version_b").length;
  const neitherCount = results.filter((r) => r.winner === "neither").length;

  const shown = ranVariants ?? variants;
  const modelUsed = results[0]?.model ?? null;
  const demoOf = (id: string) => personaDemographics(id, ranFacets);

  const pickCls = (w: string) => (w === "send_a" ? "a" : w === "send_b" ? "b" : w === "either" ? "either" : "neither");
  const pickLabel = (w: string) =>
    w === "send_a" ? "Chose A" : w === "send_b" ? "Chose B" : w === "either" ? "No preference" : "Rejected both";
  const trustLabelOf = (t: string) =>
    t === "version_a" ? "Version A" : t === "version_b" ? "Version B" : t === "both_equal" ? "Both equally" : "Neither";

  function verdictLine(): string {
    if (!analysis) return "";
    if (analysis.verdict === "rework")
      return `Most of the panel would act on neither version — ${neitherCount} of ${n} rejected both.`;
    if (analysis.verdict === "tie")
      return `Too close to call — ${gA} vs ${gB} of ${n} would convert.`;
    const win = analysis.verdict === "ship_a" ? "A" : "B";
    return `Version ${win} converted more of the panel — ${Math.max(gA, gB)} vs ${Math.min(gA, gB)} of ${n} would convert.`;
  }

  // How much to trust the call — driven by whether the two would-convert
  // confidence intervals overlap (non-overlap = a real separation at this size).
  function confidence(): { level: 0 | 1 | 2 | 3; label: string; note: string } | null {
    if (!analysis || !results.length) return null;
    if (analysis.verdict === "rework")
      return { level: 1, label: "Low", note: `${neitherCount} of ${n} would act on neither version` };
    if (analysis.verdict === "tie")
      return { level: 1, label: "Low", note: "the two versions are within noise of each other" };
    const a = wilson(gA, n);
    const b = wilson(gB, n);
    const overlap = Math.min(a.high, b.high) - Math.max(a.low, b.low);
    if (overlap <= 0) return { level: 3, label: "High", note: "the would-convert intervals don't overlap" };
    if (overlap < 0.12) return { level: 2, label: "Moderate", note: `a clear lead, though the intervals still touch at this panel size` };
    return { level: 1, label: "Low", note: `the intervals overlap — read as directional at this panel size` };
  }

  // Gate the loud badge on the statistics: an overlapping-interval "ship" is
  // shown as a non-conclusive lean, so the headline never outruns the numbers.
  function shownVerdictLabel(c: ReturnType<typeof confidence>): string {
    if (!analysis) return "";
    if ((analysis.verdict === "ship_a" || analysis.verdict === "ship_b") && c && c.level <= 1) {
      return `Lean ${analysis.verdict === "ship_a" ? "A" : "B"} — not conclusive`;
    }
    return VERDICT_LABEL[analysis.verdict];
  }

  function nextStep(): string {
    if (!analysis) return "";
    const v = shown;
    const c = confidence();
    const topHigh = analysis.actions?.find((a) => a.priority === "high") ?? analysis.actions?.[0];
    if (analysis.verdict === "tie")
      return `Refine the weaker version and re-test${canRefine ? " (try Auto-refine below)" : ""}, or add more reactions to tighten the estimate — the panel can't separate them yet.`;
    if (analysis.verdict === "rework")
      return topHigh ? topHigh.action : "Rework the core offer before running another test.";
    const win = analysis.verdict === "ship_a" ? v.labelA : v.labelB;
    const letter = analysis.verdict === "ship_a" ? "A" : "B";
    if (c && c.level <= 1)
      return `Version ${letter} (“${win}”) leads, but not conclusively — refine or add reactions before committing.`;
    return topHigh
      ? `Ship Version ${letter} (“${win}”) — but first: ${topHigh.action.replace(/\.$/, "")}.`
      : `Ship Version ${letter} (“${win}”) as-is.`;
  }

  const canRefine = !isDemo && resultsAsset !== "website";

  // Whether the winner held across both presentation orders (order-bias check).
  function orderCheck(): string | null {
    if (!analysis || (analysis.verdict !== "ship_a" && analysis.verdict !== "ship_b")) return null;
    const conv = (rs: PersonaResult[], k: "intentA" | "intentB") =>
      rs.filter((r) => GIVE_INTENTS.includes(r[k])).length;
    const ab = results.filter((r) => r.order === "ab");
    const ba = results.filter((r) => r.order === "ba");
    if (ab.length < 3 || ba.length < 3) return null;
    const winIn = (rs: PersonaResult[]) => (conv(rs, "intentA") === conv(rs, "intentB") ? "tie" : conv(rs, "intentA") > conv(rs, "intentB") ? "A" : "B");
    const overall = analysis.verdict === "ship_a" ? "A" : "B";
    const held = winIn(ab) === overall && winIn(ba) === overall;
    return held
      ? "The winner held in both presentation orders (A-first and B-first)."
      : "Heads up: the lead flips between the A-first and B-first halves, so it may be order-sensitive — add reactions before trusting it.";
  }

  function currentExportInput(): ExportInput {
    const c = confidence();
    return {
      variants: shown,
      results,
      analysis,
      industryKey: ranIndustry,
      industryLabel: INDUSTRIES.find((i) => i.key === ranIndustry)?.label ?? "General / other",
      assetType: resultsAsset,
      model: modelUsed,
      isDemo,
      generatedAt: generatedAt ?? new Date().toISOString(),
      confidence: c ? { label: c.label, note: c.note } : null,
      facets: ranFacets,
      cohortText: ranCohortText,
    };
  }

  function downloadJson() {
    download(
      `message-test-${Date.now()}.json`,
      JSON.stringify(buildRunExport(currentExportInput()), null, 2),
      "application/json"
    );
  }
  function downloadReport() {
    download(`message-test-${Date.now()}.md`, runToMarkdown(currentExportInput()), "text/markdown");
  }

  function summaryText(): string {
    if (!analysis) return "";
    const v = shown;
    const c = confidence();
    const L = [
      isDemo ? "DEMO — sample data, not a real run." : "",
      `MESSAGE TEST — ${shownVerdictLabel(c)}`,
      verdictLine(),
      c ? `Confidence: ${c.label} — ${c.note}.` : "",
      `Would convert: A ${shareWithCI(gA, n)} · B ${shareWithCI(gB, n)}`,
      `Next: ${nextStep()}`,
      "",
      `A "${v.labelA}" vs B "${v.labelB}" · ${results.length} simulated reactions`,
      `Head-to-head: A ${winners.a} / B ${winners.b} · rejected both ${neitherCount}.`,
    ].filter(Boolean);
    if (analysis.keyPoints?.length) {
      L.push("", "WHY:");
      analysis.keyPoints.forEach((k, i) => L.push(`  ${i + 1}. ${k.point} — ${k.why}`));
    }
    if (analysis.actions?.length) {
      L.push("", "WHAT TO DO:");
      analysis.actions.forEach((a) => L.push(`  [${a.priority}] ${a.action}`));
    }
    L.push("", "Simulated audience responses — directional signal, not a prediction. Validate with real sends.");
    return L.join("\n");
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to clipboard — your browser may block it on this page.");
    }
  }

  // ---- Participant modal: focus trap + Escape + focus return ----
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!openP) return;
    lastFocused.current = document.activeElement as HTMLElement;
    const node = modalRef.current;
    const focusables = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];
    focusables()[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenP(null);
        return;
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const idx = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && idx <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && idx === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocused.current?.focus?.();
    };
  }, [openP]);

  const estCost = estimateRunCost(liveSize, true);
  const liveCapped = plannedSize > LIVE_MAX;

  return (
    <>
      {view === "setup" && (
      <>
      <div className="pagehead">
        <h1>Build a message simulation</h1>
        <p>
          Set up your audience and drop in two versions of a message, then test them against a panel
          of simulated buyers — with an executive read of the results, not a wall of charts.
        </p>
      </div>

      {/* Live recipe — what this simulation will do, updates as you build it */}
      <div className="simrecipe">
        <span className="sr-k">Simulation</span>
        <span className="sr-body">
          This is a <b>{plannedSize.toLocaleString()}-person {industryLabel.toLowerCase()} panel</b> across{" "}
          {segments.length} segment{segments.length === 1 ? "" : "s"}. You&apos;ll <b>meet them below</b> and adjust who&apos;s
          in the room, then each reacts to both versions of{" "}
          <b>{variants.assetType === "website" ? "your website screen" : `your ${messageType.toLowerCase()}`}</b> — and you&apos;ll
          hear <b>how each segment responded</b> and which version wins for whom.
        </span>
      </div>

      {/* Industry + the bots */}
      <section className="card">
        <h2 className="step">1 · Industry &amp; panel</h2>
        <div className="grid2" style={{ marginBottom: 4 }}>
          <div>
            <label className="fld" htmlFor="industry-select">Industry</label>
            <select
              id="industry-select"
              value={industry}
              onChange={(e) => changeIndustry(e.target.value)}
              disabled={running || refining}
            >
              {INDUSTRIES.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="fld" id="asset-type-label">Asset type</label>
            <div className="seg" role="group" aria-labelledby="asset-type-label">
              {(Object.keys(ASSET_LABELS) as AssetType[]).map((t) => (
                <button
                  key={t}
                  className={variants.assetType === t ? "on" : ""}
                  aria-pressed={variants.assetType === t}
                  onClick={() => setVariants((v) => ({ ...v, assetType: t }))}
                  disabled={running || refining}
                >
                  {ASSET_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 12 }}>
          {variants.assetType !== "website" && (
            <div>
              <label className="fld" htmlFor="msgtype-select">Message type — who’s receiving this</label>
              <select
                id="msgtype-select"
                value={messageType}
                onChange={(e) => setMessageType(e.target.value)}
                disabled={drafting || running || refining}
              >
                {msgTypes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="fld" id="panelsize-label">Panel size</label>
            <div className="seg" role="group" aria-labelledby="panelsize-label">
              {PANEL_SIZES.map((p) => (
                <button
                  key={p.n}
                  className={plannedSize === p.n ? "on" : ""}
                  aria-pressed={plannedSize === p.n}
                  onClick={() => resizePanel(p.n)}
                  disabled={running || refining}
                  title={`${p.n.toLocaleString()} people`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="projn">
              <b>{plannedSize.toLocaleString()}</b>-person panel · {segments.length} segments
              {liveCapped && <> · live run samples {LIVE_MAX}, demo runs all</>}
            </p>
          </div>
        </div>

        {/* Cohort builder — auto-fills to a general population; dial in exact demographics */}
        <div className="cohort">
          <div className="fld" style={{ marginTop: 18 }}>
            Audience cohort{" "}
            <span className="note" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--sans)" }}>
              · optional — leave blank for a general population
            </span>
          </div>
          <input
            type="text"
            placeholder="Describe your audience — e.g. “busy parents who watch grocery prices”"
            value={cohortText}
            onChange={(e) => setCohortText(e.target.value)}
            disabled={running || refining}
            maxLength={400}
          />
          <div className="facetgroups">
            {FACET_GROUPS.map((g) => (
              <div className="facetgroup" key={g.key}>
                <div className="facetlabel">{g.label}</div>
                <div className="facetchips">
                  {g.options.map((opt) => {
                    const on = cohort[g.key].includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={`facetchip ${on ? "on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleFacet(g.key, opt)}
                        disabled={running || refining}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="projn">
            Panel: <b>{cohortSummary(cohort, cohortText)}</b>
            {!cohortIsEmpty(cohort, cohortText) && (
              <>
                {" · "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    setCohort(emptyCohort());
                    setCohortText("");
                  }}
                >
                  reset to general
                </button>
              </>
            )}
          </p>
        </div>

        {/* Meet your panel — editable audience segments (the "potentials") */}
        <div className="panelbuilder">
          <div className="pb-head">
            <div>
              <div className="fld" style={{ margin: 0 }}>Meet your panel</div>
              <p className="projn" style={{ margin: "3px 0 0" }}>
                Auto-filled for {industryLabel}
                {variants.assetType !== "website" && messageAudienceKey(messageType) ? <> · a {messageType.toLowerCase()}</> : null}.
                Adjust who&apos;s in the room, how many of each, rename them, or add your own.
              </p>
            </div>
          </div>

          <div className="segeditor">
            {segments.map((s) => (
              <div className="segrow" key={s.id}>
                <span className="ico" title={s.name}>{monogram(s.name)}</span>
                <div className="segmain">
                  <input className="segname" value={s.name} onChange={(e) => editSeg(s.id, { name: e.target.value })} disabled={running || refining} aria-label="Segment name" />
                  <input className="seghow" value={s.how} onChange={(e) => editSeg(s.id, { how: e.target.value })} disabled={running || refining} aria-label="Who they are" />
                </div>
                <div className="segcount" role="group" aria-label={`${s.name} count`}>
                  <button onClick={() => setSegCount(s.id, s.count - 1)} disabled={running || refining} aria-label="Fewer">−</button>
                  <input type="number" min={0} value={s.count} onChange={(e) => setSegCount(s.id, Number(e.target.value))} disabled={running || refining} />
                  <button onClick={() => setSegCount(s.id, s.count + 1)} disabled={running || refining} aria-label="More">+</button>
                </div>
                <span className="segpct">{Math.round((s.count / (plannedSize || 1)) * 100)}%</span>
                <button className="xbtn" onClick={() => removeSeg(s.id)} disabled={segments.length <= 1 || running || refining} title="Remove segment" aria-label="Remove segment">×</button>
              </div>
            ))}
          </div>

          <div className="pb-actions">
            <button className="btn ghost" onClick={addSeg} disabled={running || refining}>+ Add segment</button>
            <button className="btn ghost" onClick={() => setSegments(autoSegments(industry, messageType, plannedSize))} disabled={running || refining}>Auto-fill for this message</button>
            <span className="note">Panel total: <b>{plannedSize.toLocaleString()}</b> people</span>
          </div>

          <details className="method" style={{ marginTop: 12 }}>
            <summary>The {ANALYSTS.length} analyst bots that read the reactions</summary>
            <div className="botgrid" style={{ marginTop: 10 }}>
              {ANALYSTS.map((a) => (
                <div className="botcard analyst" key={a.key}>
                  <div className="bt">
                    <span className="ico">{monogram(a.label)}</span>
                    {a.label}
                  </div>
                  <div className="bh">{a.lens}</div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>

      {/* Variants */}
      <section className="card">
        <h2 className="step">2 · Message variants</h2>
        <p className="sub">{ASSET_HINTS[variants.assetType]}</p>
        {variants.assetType !== "website" && (
          <div className="craftbar">
            <button
              className="btn primary"
              onClick={() => autoCraft()}
              disabled={drafting || running || refining}
            >
              {drafting ? "Crafting…" : autoCrafted ? `Re-craft for ${INDUSTRIES.find((i) => i.key === industry)?.label}` : "Auto-craft variants"}
            </button>
            <span className="note">
              Claude drafts two A/B versions of a {messageType.toLowerCase()} for{" "}
              {INDUSTRIES.find((i) => i.key === industry)?.label}, or edit the sample / paste your own below.
            </span>
          </div>
        )}
        <div className="grid2">
          {(["A", "B"] as const).map((v) => {
            const labelKey = v === "A" ? "labelA" : "labelB";
            const copyKey = v === "A" ? "copyA" : "copyB";
            const imageKey = v === "A" ? "imageA" : "imageB";
            const isSample = variants.assetType !== "website" && isPristineCopy(variants[copyKey]) && variants[copyKey].trim() !== "";
            return (
              <div key={v}>
                <label className="fld" htmlFor={`label-${v}`}>
                  Version {v} label
                  {isSample && <span className="demotag" style={{ marginLeft: 8 }}>Sample</span>}
                </label>
                <input
                  id={`label-${v}`}
                  type="text"
                  value={variants[labelKey]}
                  onChange={(e) => setVariants((prev) => ({ ...prev, [labelKey]: e.target.value }))}
                />
                {variants.assetType === "website" ? (
                  <>
                    <label className="fld" style={{ marginTop: 10 }} htmlFor={`shot-${v}`}>
                      Version {v} screenshot
                    </label>
                    <div className="shot">
                      <input
                        id={`shot-${v}`}
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const url = await fileToDataUrl(file);
                            setVariants((prev) => ({ ...prev, [imageKey]: url }));
                            setError(null);
                          } catch {
                            setError(`Could not read the Version ${v} image file.`);
                          }
                        }}
                      />
                      {variants[imageKey] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={variants[imageKey]} alt={`Version ${v} screenshot preview`} />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="fld" style={{ marginTop: 10 }} htmlFor={`copy-${v}`}>
                      Version {v} copy {isSample && <span className="note">· sample, replace with your own</span>}
                    </label>
                    <textarea
                      id={`copy-${v}`}
                      className="grow"
                      ref={autoSize}
                      value={variants[copyKey]}
                      onChange={(e) => {
                        resizeTa(e.target);
                        const val = e.target.value;
                        setVariants((prev) => ({ ...prev, [copyKey]: val }));
                        setAutoCrafted(false);
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="runbar" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={runLive} disabled={running || refining}>
            {running ? `Running… ${done}/${panelSize}` : "Run test"}
          </button>
          <button className="btn ghost" onClick={runDemo} disabled={running || refining}>
            Load demo results
          </button>
          {running && (
            <div className="progress">
              <div style={{ width: `${panelSize ? (done / panelSize) * 100 : 0}%` }} />
            </div>
          )}
          <span className="note">
            {running
              ? `${done}/${panelSize} reactions${error ? " · some retrying…" : ""}`
              : results.length
                ? isDemo
                  ? "Demo data (deterministic, no API calls)"
                  : `${results.length} reactions completed`
                : liveCapped
                  ? `Run test simulates a representative ${LIVE_MAX} of your ${plannedSize.toLocaleString()}-person panel (~1–2 min · approx ${formatCost(estCost)}). Load demo runs all ${plannedSize.toLocaleString()} instantly, free.`
                  : `~1–2 min · ${plannedSize} reactions · approx ${formatCost(estCost)} in API usage`}
          </span>
          {sessionSpend > 0 && (
            <span className="costmeter" title="Approximate API spend this session">
              Session ≈ <b>{formatCost(sessionSpend)}</b>
            </span>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2 className="step">Variant history</h2>
          <p className="sub">
            Earlier versions of your two messages — newest first. Each change (auto-craft, a refine
            round, or a restore) snapshots what came before. Restore any prior version.
          </p>
          <ol className="vhist">
            {history.map((h) => (
              <li key={h.id}>
                <div className="vhist-h">
                  <span className="vhist-note">{h.note}</span>
                  <button className="linklike" onClick={() => restoreVariant(h)}>
                    Restore
                  </button>
                </div>
                <div className="vhist-labels">A · {h.v.labelA} &nbsp;·&nbsp; B · {h.v.labelB}</div>
                <details className="draftdiff">
                  <summary>View both messages</summary>
                  <div className="vhist-copies">
                    <div>
                      <b>Version A — {h.v.labelA}</b>
                      <pre>{h.v.copyA}</pre>
                    </div>
                    <div>
                      <b>Version B — {h.v.labelB}</b>
                      <pre>{h.v.copyB}</pre>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}

      </>
      )}

      {view === "results" && (
        <>
          <div className="resultshead">
            <button className="backbtn" onClick={() => { setView("setup"); window.scrollTo({ top: 0 }); }}>
              ← Back to setup
            </button>
            <div className="rh-meta">
              <b>{INDUSTRIES.find((i) => i.key === ranIndustry)?.label ?? "Results"}</b>
              <span> · {ASSET_LABELS[resultsAsset]} · {results.length} in the room · {cohortSummary(ranFacets, ranCohortText)}</span>
            </div>
          </div>

          {results.length > 0 && (
        <>
          {/* Verdict hero */}
          {(() => {
            const c = confidence();
            return (
              <section className="card verdict">
                <div className="vtop">
                  <div className="vlabel">Recommendation{isDemo && <span className="demotag" style={{ marginLeft: 10 }}>Demo</span>}</div>
                  {analysis && (
                    <div className="vactions">
                      <button className="copybtn" onClick={copySummary} title="Copy the verdict and reasoning as text">
                        {copied ? "Copied ✓" : "Copy summary"}
                      </button>
                      <button className="copybtn" onClick={downloadJson} title="Download the full run as JSON (with manifest)">
                        Download run
                      </button>
                      <button className="copybtn" onClick={downloadReport} title="Download a Markdown report">
                        Report
                      </button>
                      <button className="copybtn" onClick={() => window.print()} title="Print or save the report as PDF">
                        Print
                      </button>
                    </div>
                  )}
                </div>
                <div className="vhead">
                  <span className={`vbadge ${analysis?.verdict ?? "tie"}`}>
                    {analyzing ? "Analyzing…" : analysis ? shownVerdictLabel(c) : "Collecting reactions…"}
                  </span>
                  {analysis && <div className="vheadline">{verdictLine()}</div>}
                </div>
                {analyzing && <p className="note">The analyst bots are interpreting the reactions…</p>}
                {analysis && (
                  <>
                    {c && (
                      <div className="confrow">
                        <span className={`confmeter lvl${c.level}`} aria-hidden="true">
                          <i /><i /><i />
                        </span>
                        <span className="conflabel">{c.label} confidence</span>
                        <span className="confnote">— {c.note}</span>
                      </div>
                    )}
                    <p className="groupstat" style={{ marginTop: 10 }}>
                      Would convert: A <b>{shareWithCI(gA, n)}</b> &nbsp;·&nbsp; B <b>{shareWithCI(gB, n)}</b>
                    </p>
                    <div className="recgrid">
                      {analysis.keyPoints?.[0]?.point && (
                        <div className="recline">
                          <span className="reck">Why</span>
                          <span>{analysis.keyPoints[0].point}.</span>
                        </div>
                      )}
                      <div className="recline">
                        <span className="reck next">Next</span>
                        <span>{nextStep()}</span>
                      </div>
                    </div>
                    {analysis.verdict === "tie" && !isDemo && (
                      <div style={{ marginTop: 14 }}>
                        <button className="btn ghost" onClick={addMoreReactions} disabled={running || refining}>
                          {running ? "Adding…" : "Add ~20 more reactions to tighten this"}
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className="vmeta">
                  A · {shown.labelA} &nbsp;vs&nbsp; B · {shown.labelB} &nbsp;·&nbsp; {results.length} reactions ·{" "}
                  {INDUSTRIES.find((i) => i.key === ranIndustry)?.label} · {ASSET_LABELS[resultsAsset]}
                </div>
              </section>
            );
          })()}

          {/* The focus group — how the room split, then representative participants */}
          {(() => {
            const eitherCount = results.filter((r) => r.winner === "either").length;
            const splitSegs = [
              { k: "send_a", n2: winners.a, label: "Chose A", color: "var(--series-a)" },
              { k: "send_b", n2: winners.b, label: "Chose B", color: "var(--series-b)" },
              { k: "either", n2: eitherCount, label: "No preference", color: "var(--neutral-bar)" },
              { k: "neither", n2: neitherCount, label: "Rejected both", color: "var(--reject-bar)" },
            ];
            const votes = [
              { key: "all", label: "Everyone" },
              { key: "send_a", label: "Chose A" },
              { key: "send_b", label: "Chose B" },
              { key: "either", label: "No preference" },
              { key: "neither", label: "Rejected both" },
            ] as const;
            const voteCount = (k: string) => (k === "all" ? results.length : results.filter((r) => r.winner === k).length);
            const segs = results.reduce<string[]>((a, r) => (a.includes(r.giving) ? a : [...a, r.giving]), []);
            const filtered = results.filter(
              (r) => (reactVote === "all" || r.winner === reactVote) && (reactSeg === "all" || r.giving === reactSeg)
            );
            const visible = filtered.slice(0, DISPLAY_MAX);
            return (
              <section className="card">
                <h2 className="step">The focus group</h2>
                <p className="sub">
                  {results.length} simulated participants each read both versions and reacted. The bar shows{" "}
                  <b>which version each preferred</b>; the tiles below show <b>how many would act on each</b> — two
                  different measures.
                </p>

                {/* How the room split */}
                <div className="splitbar">
                  {splitSegs.map((s) =>
                    s.n2 > 0 ? (
                      <span key={s.k} className="ss" style={{ width: `${(s.n2 / (results.length || 1)) * 100}%`, background: s.color }} title={`${s.label}: ${s.n2}`} />
                    ) : null
                  )}
                </div>
                <div className="splitkey">
                  {splitSegs.map((s) => (
                    <span key={s.k} className="sk">
                      <i style={{ background: s.color }} />
                      {s.label} <b>{s.n2}</b>
                    </span>
                  ))}
                </div>

                {/* Headline metrics as tiles */}
                <div className="abtiles">
                  <div className="abtile">
                    <div className="abk">Would act on it</div>
                    <div className="abrow"><span className="abdot a" /> A <span className="abv">{gA}</span> <span className="abci">{shareWithCI(gA, n)}</span></div>
                    <div className="abrow"><span className="abdot b" /> B <span className="abv">{gB}</span> <span className="abci">{shareWithCI(gB, n)}</span></div>
                  </div>
                  <div className="abtile">
                    <div className="abk">Rated more trustworthy</div>
                    <div className="abrow"><span className="abdot a" /> A <span className="abv">{trustA}</span></div>
                    <div className="abrow"><span className="abdot b" /> B <span className="abv">{trustB}</span></div>
                  </div>
                  <div className="abtile">
                    <div className="abk">Avg resonance (of 5)</div>
                    <div className="abrow"><span className="abdot a" /> A <span className="abv">{mean("resonanceA").toFixed(1)}</span></div>
                    <div className="abrow"><span className="abdot b" /> B <span className="abv">{mean("resonanceB").toFixed(1)}</span></div>
                  </div>
                </div>
                {orderCheck() && <p className="smalln">{orderCheck()}</p>}

                {/* Participants */}
                <div className="fgh">
                  <h3 className="tabh" style={{ margin: 0 }}>The room — all {results.length} participants</h3>
                  <div className="seg" role="group" aria-label="Detail view" style={{ marginBottom: 0 }}>
                    <button className={detailView === "cards" ? "on" : ""} aria-pressed={detailView === "cards"} onClick={() => setDetailView("cards")}>Cards</button>
                    <button className={detailView === "table" ? "on" : ""} aria-pressed={detailView === "table"} onClick={() => setDetailView("table")}>Table</button>
                  </div>
                </div>
                <div className="rfilters">
                  {votes.map((v) => (
                    <button
                      key={v.key}
                      className={`rfchip ${pickCls(v.key)} ${reactVote === v.key ? "on" : ""}`}
                      aria-pressed={reactVote === v.key}
                      onClick={() => setReactVote(v.key)}
                      disabled={v.key !== "all" && voteCount(v.key) === 0}
                    >
                      {v.label} <em>{voteCount(v.key)}</em>
                    </button>
                  ))}
                </div>
                <div className="rfilters seg">
                  <button className={`segchip ${reactSeg === "all" ? "on" : ""}`} aria-pressed={reactSeg === "all"} onClick={() => setReactSeg("all")}>
                    All types
                  </button>
                  {segs.map((s) => (
                    <button
                      key={s}
                      className={`segchip ${reactSeg === s ? "on" : ""}`}
                      aria-pressed={reactSeg === s}
                      onClick={() => setReactSeg((cur) => (cur === s ? "all" : s))}
                    >
                      {segmentLabel(s)} <em>{results.filter((r) => r.giving === s).length}</em>
                    </button>
                  ))}
                </div>

                {detailView === "cards" ? (
                  <div className="participants">
                    {visible.map((r) => {
                      const d = demoOf(r.personaId);
                      return (
                        <button key={r.personaId} className={`pcard ${pickCls(r.winner)}`} onClick={() => setOpenP(r)}>
                          <div className="phead">
                            <span className="ico">{monogram(r.personaName)}</span>
                            <div className="pwho">
                              <div className="pname">{r.personaName}</div>
                              <div className="pseg">{d.age} · {d.region} · {segmentLabel(r.giving)}</div>
                            </div>
                            <span className={`pick ${pickCls(r.winner)}`}>{pickLabel(r.winner)}</span>
                          </div>
                          <div className="preact">&ldquo;{r.rationale}&rdquo;</div>
                          <div className="pmore">Open profile →</div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tablewrap">
                    <table className="results">
                      <thead>
                        <tr>
                          <th>Respondent</th>
                          <th>Age</th>
                          <th>Region</th>
                          <th>Type</th>
                          <th>Chose</th>
                          <th>Would do · A</th>
                          <th>Would do · B</th>
                          <th>Res A/B</th>
                          <th>Trusted</th>
                          <th>Saw</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((r) => {
                          const d = demoOf(r.personaId);
                          return (
                            <tr key={r.personaId} onClick={() => setOpenP(r)} style={{ cursor: "pointer" }}>
                              <td>
                                <b>{r.personaName}</b> <span className="rowsub">{memberNo(r.personaId)}</span>
                              </td>
                              <td>{d.age}</td>
                              <td>{d.region}</td>
                              <td>{segmentLabel(r.giving)}</td>
                              <td><span className={`pick ${pickCls(r.winner)}`}>{pickLabel(r.winner)}</span></td>
                              <td>{INTENT_LABELS[resultsAsset][r.intentA]}</td>
                              <td>{INTENT_LABELS[resultsAsset][r.intentB]}</td>
                              <td>{r.resonanceA}/{r.resonanceB}</td>
                              <td>{trustLabelOf(r.trust)}</td>
                              <td>{r.order === "ba" ? "B" : "A"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {filtered.length === 0 && <p className="note">No participants match this filter.</p>}
                {filtered.length > DISPLAY_MAX && (
                  <p className="note">Showing {DISPLAY_MAX} of {filtered.length} — the metrics above use the full panel.</p>
                )}

                <p className="caveat" style={{ margin: "20px 0 0" }}>
                  Directional signal from {results.length} simulated participants — persona-agent estimates, not a
                  prediction of real-world behavior. Results depend on the persona model
                  {modelUsed ? ` (${modelUsed})` : ""}; confirm important calls with real people.
                </p>
              </section>
            );
          })()}

          {/* What the analysts saw — collapsed by default so the focus group leads */}
          {analysis && (analysis.keyPoints?.length || analysis.segments?.length || analysis.analysts?.length) ? (
            <section className="card">
              <details className="method">
                <summary style={{ fontSize: 15 }}>Analyst breakdown — why, what to do, by segment</summary>
                <div style={{ marginTop: 14 }}>

              {analysis.keyPoints?.length ? (
                <ol className="keypoints">
                  {analysis.keyPoints.slice(0, 3).map((k, i) => (
                    <li key={i}>
                      <div className="kp-point">{k.point}</div>
                      <div className="kp-why">{k.why}</div>
                    </li>
                  ))}
                </ol>
              ) : null}

              {analysis.actions?.length ? (
                <>
                  <h3 className="tabh">What to do</h3>
                  <ul className="actionlist">
                    {analysis.actions.map((a, i) => (
                      <li key={i}>
                        <span className={`pri ${a.priority}`}>{a.priority}</span>
                        {a.action}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {analysis.segments?.length ? (
                <>
                  <h3 className="tabh">By segment</h3>
                  <p className="smalln">Segment splits are directional only — a few reactions each.</p>
                  <div className="segcards">
                    {analysis.segments.map((s, i) => {
                      const segN = results.filter((r) => r.giving === s.segment).length;
                      return (
                        <div className="segcard" key={i}>
                          <div className="st">{segmentLabel(s.segment)}{segN > 0 && segN < 8 ? <span className="smalln" style={{ marginLeft: 6 }}>· n={segN}, too small to read</span> : null}</div>
                          <div className="sl">{s.driver}</div>
                          <div className="sl">{s.barrier}</div>
                          <div className="sl muted">{s.divergence}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {analysis.analysts?.length ? (
                <>
                  <h3 className="tabh">Analyst reads</h3>
                  <div className="analystlist">
                    {analysis.analysts.map((a, i) => {
                      const meta = ANALYSTS.find((x) => x.key === a.key);
                      return (
                        <div className="analystrow" key={i}>
                          <div className="al">
                            <span className="ico">{monogram(meta?.label ?? a.key)}</span>
                            {meta?.label ?? a.key}
                          </div>
                          <div className="ar">{a.read}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
                </div>
              </details>
            </section>
          ) : null}

          {/* Methodology — a linkable answer to "can I trust this?" */}
          <section className="card">
            <details className="method">
              <summary>How this works &amp; how to read it</summary>
              <p>
                Message Lab conditions Claude on an audience archetype (a persona-agent) and has it react to
                both versions, then a panel of analyst bots interprets the results. It is grounded in the
                MatrAIx persona-agent research (arXiv 2608.04205): results are <b>model-dependent</b> and{" "}
                <b>hypothesis-generating</b> — directional signal, not a prediction of real-world behavior.
              </p>
              <ul>
                <li>Each persona sees the two versions in an alternating order (half see B first) to control for position bias.</li>
                <li>Headline give-rates are reported with a 95% Wilson confidence interval, so a small-panel count isn&apos;t read as precise.</li>
                <li>The verdict is downgraded to a non-conclusive &ldquo;lean&rdquo; when those intervals overlap.</li>
                <li>Validate high-stakes calls with a real send; use this to decide what to test, not to skip testing.</li>
              </ul>
            </details>
          </section>

          {/* Auto-refine — optional */}
          {canRefine && (
            <section className="card">
              <h2 className="step">Auto-refine the weaker version</h2>
              <p className="sub">
                Claude drafts a stronger challenger for the weaker version and re-runs the panel until the
                conversion rate stops improving — up to {MAX_REFINE_ROUNDS} rounds. Each round costs roughly{" "}
                {formatCost(estimateRunCost(plannedSize, true) + 0.03)}.
              </p>
              <div className="runbar">
                {refining ? (
                  <button className="btn ghost" onClick={() => (stopRef.current = true)}>
                    Stop after this round
                  </button>
                ) : (
                  <button className="btn primary" onClick={refineLoop} disabled={running}>
                    Auto-refine
                  </button>
                )}
                <span className="note">
                  {refineNote ?? `Up to ${MAX_REFINE_ROUNDS} rounds · stops when conversion plateaus`}
                </span>
              </div>
              {rounds.length > 0 && (
                <ol className="rounds">
                  {rounds.map((r, i) => (
                    <li key={i}>
                      <div>
                        <strong>Round {i + 1}</strong> · {r.labelA} <b>{r.votesA}–{r.votesB}</b> {r.labelB}
                        <span className="note"> · would convert: {r.givesA} vs {r.givesB} · rejected both: {r.neither}</span>
                      </div>
                      {r.draft && (
                        <details className="draftdiff">
                          <summary>
                            What changed → Version {r.draft.version}: &ldquo;{r.draft.newLabel}&rdquo; replaced &ldquo;{r.draft.prevLabel}&rdquo;
                          </summary>
                          <DiffView before={r.draft.prevCopy} after={r.draft.newCopy} />
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {/* Participant detail — full read on one person */}
          {openP && (() => {
            const how = (ranSegments.length ? ranSegments : segments).find((a) => a.name === openP.giving)?.how;
            const resPct = (v: number) => Math.max(4, (v / 5) * 100);
            return (
              <div className="pmodal-bg" onClick={() => setOpenP(null)}>
                <div
                  className="pmodal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="pm-name"
                  ref={modalRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="pmodal-x" onClick={() => setOpenP(null)} aria-label="Close">×</button>
                  <div className="pm-head">
                    <span className="ico">{monogram(openP.personaName)}</span>
                    <div className="pwho">
                      <div className="pm-name" id="pm-name">{openP.personaName}</div>
                      <div className="pseg">{segmentLabel(openP.giving)} · {memberNo(openP.personaId)}</div>
                    </div>
                    <span className={`pick ${pickCls(openP.winner)}`}>{pickLabel(openP.winner)}</span>
                  </div>

                  {(() => {
                    const d = demoOf(openP.personaId);
                    return (
                      <div className="pm-sec">
                        <div className="pm-k">Who they are</div>
                        <div className="pm-tags">
                          <span className="pm-tag">{d.age}</span>
                          <span className="pm-tag">{d.region}</span>
                          <span className="pm-tag">{d.household}</span>
                          <span className="pm-tag">{d.behavior}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {how && (
                    <div className="pm-sec">
                      <div className="pm-k">How this person reads a message</div>
                      <p className="pm-p">{how}</p>
                    </div>
                  )}

                  <div className="pm-sec">
                    <div className="pm-k">In their words</div>
                    <p className="pm-quote">&ldquo;{openP.rationale}&rdquo;</p>
                  </div>

                  <div className="pm-sec">
                    <div className="pm-k">How they rated each version</div>
                    <div className="pm-bar"><span className="pm-bl">A</span><div className="pm-track"><div className="pm-fill a" style={{ width: `${resPct(openP.resonanceA)}%` }} /></div><b>{openP.resonanceA}/5</b></div>
                    <div className="pm-bar"><span className="pm-bl">B</span><div className="pm-track"><div className="pm-fill b" style={{ width: `${resPct(openP.resonanceB)}%` }} /></div><b>{openP.resonanceB}/5</b></div>
                  </div>

                  <div className="pm-grid">
                    <div className="pm-cell"><div className="pm-k">Would do · A</div><div className="pm-v">{INTENT_LABELS[resultsAsset][openP.intentA]}</div></div>
                    <div className="pm-cell"><div className="pm-k">Would do · B</div><div className="pm-v">{INTENT_LABELS[resultsAsset][openP.intentB]}</div></div>
                    <div className="pm-cell"><div className="pm-k">Trusted more</div><div className="pm-v">{trustLabelOf(openP.trust)}</div></div>
                    <div className="pm-cell"><div className="pm-k">Baseline intent</div><div className="pm-v">{openP.baselineIntent}/5 to act at all</div></div>
                  </div>

                  <div className="pm-meta">
                    Saw {openP.order === "ba" ? "B first, then A" : "A first, then B"}
                    {openP.model ? ` · simulated by ${openP.model}` : ""}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
        </>
      )}
    </>
  );
}
