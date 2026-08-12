"use client";

import { useMemo, useRef, useState } from "react";
import type { AssetType, Persona, PersonaResult, Variants } from "@/lib/types";
import { ASSET_LABELS, INTENT_LABELS, segmentLabel } from "@/lib/types";
import { demoResult } from "@/lib/demo";
import { tally, type RoundSummary } from "@/lib/refine";
import { shareWithCI, wilson } from "@/lib/stats";
import { INDUSTRIES } from "@/lib/industries";
import { ANALYSTS, panelFor, instancesPer, monogram, messageAudienceKey } from "@/lib/archetypes";
import { demoAnalysis, VERDICT_LABEL, type Analysis } from "@/lib/analysis";
import { sampleFor, isPristineCopy, MESSAGE_TYPES, messageTypesFor } from "@/lib/samples";
import { IntentChart, Legend, ResonanceChart, VoteDonut } from "@/components/Charts";
import { DiffView } from "@/components/Diff";

const CONCURRENCY = 4;
const MAX_REFINE_ROUNDS = 10;

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

// Build the run panel from the chosen industry's archetypes: a few individual
// instances per archetype so the segment carries a usable sample.
function buildPanel(industryKey: string, messageType?: string): PanelMember[] {
  const arch = panelFor(industryKey, messageType);
  const per = instancesPer(arch.length);
  const out: PanelMember[] = [];
  for (const a of arch) {
    for (let i = 0; i < per; i++) {
      out.push({
        base: a.base,
        persona: {
          id: `${industryKey}:${a.name}:${i}`,
          name: `${a.name} #${i + 1}`,
          giving: a.name,
          age: null,
          dimensions: {
            archetype: a.name,
            how_they_judge: a.how,
            note: "You are one specific individual of this type — bring your own quirks, mood, and priorities. Do not answer as a generic average.",
          },
        },
      });
    }
  }
  return out;
}

// Downscale to Claude's vision sweet spot (long edge ≤ 1568px), re-encode JPEG.
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
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Could not read that image file."));
    };
    img.src = URL.createObjectURL(file);
  });
}

type Tab = "overview" | "reasoning" | "segments" | "analysts" | "reactions" | "data" | "refine";

export default function Home() {
  const [industry, setIndustry] = useState("general");
  const [variants, setVariants] = useState<Variants>(() => {
    const s = sampleFor("general");
    return { assetType: "email", labelA: s.labelA, labelB: s.labelB, copyA: s.copyA, copyB: s.copyB };
  });
  const [messageType, setMessageType] = useState(MESSAGE_TYPES[0]);
  const [drafting, setDrafting] = useState(false);
  // Whether the current copy came from Auto-craft (vs a sample or the user's own).
  const [autoCrafted, setAutoCrafted] = useState(false);

  // Switch industries. If the copy was auto-crafted, re-craft it for the new
  // industry; if it's still an untouched sample, swap in the new sample; if the
  // user typed their own, leave it alone.
  function changeIndustry(key: string) {
    setIndustry(key);
    // Swap the auto-craft message-type options to the new industry; keep the
    // current pick if it still exists, else default to the first.
    const list = messageTypesFor(key);
    const mt = list.includes(messageType) ? messageType : list[0];
    setMessageType(mt);
    if (autoCrafted) {
      autoCraft(key, mt);
      return;
    }
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
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Auto-craft failed") +
          " — you can edit the sample copy or paste your own instead."
      );
    } finally {
      setDrafting(false);
    }
  }

  // Grow a copy textarea to fit its content so both messages are readable
  // side-by-side without an inner scrollbar.
  function autoSize(el: HTMLTextAreaElement | null) {
    if (!el) return;
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
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const [reactVote, setReactVote] = useState<"all" | "send_a" | "send_b" | "either" | "neither">("all");
  const [reactSeg, setReactSeg] = useState<string>("all");
  // Prior versions of the two messages (newest first), captured on each change.
  const [history, setHistory] = useState<{ id: number; note: string; v: Variants }[]>([]);
  const histId = useRef(0);

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

  const archetypes = useMemo(() => panelFor(industry, messageType), [industry, messageType]);
  const msgTypes = useMemo(() => messageTypesFor(industry), [industry]);
  const plannedSize = useMemo(
    () => archetypes.length * instancesPer(archetypes.length),
    [archetypes]
  );

  async function runPanel(v: Variants): Promise<PersonaResult[]> {
    const members = buildPanel(industry, messageType);
    setRunning(true);
    setResultsAsset(v.assetType);
    setError(null);
    setResults([]);
    setIsDemo(false);
    setDone(0);
    setPanelSize(members.length);
    const out: PersonaResult[] = [];
    const queue = [...members];
    let firstError = "";
    let failCount = 0;

    async function worker() {
      while (queue.length) {
        const m = queue.shift();
        if (!m) break;
        try {
          const resp = await fetch("/api/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ persona: m.persona, variants: v }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          out.push(data as PersonaResult);
        } catch (e) {
          failCount++;
          const msg = e instanceof Error ? e.message : "failed";
          if (!firstError) firstError = msg;
          out.push({ ...demoResult(m.persona, m.base), personaId: m.persona.id, error: msg });
          // Surface the actual reason, not a canned "check your key" message.
          setError(
            `${failCount} of ${members.length} reactions failed. First error: ${firstError}` +
              (/credit balance|billing|quota|insufficient/i.test(firstError)
                ? " — this Anthropic account is out of credits. Add credits at console.anthropic.com → Plans & Billing. (Demo mode works without credits.)"
                : /\b401\b|not configured|authentication|invalid.*key/i.test(firstError)
                  ? " — check ANTHROPIC_API_KEY in Vercel settings."
                  : /\b429\b|rate|overload|\b529\b/i.test(firstError)
                    ? " — the API is rate-limiting; wait a moment and re-run, or lower the panel size."
                    : "")
          );
        }
        setDone((d) => d + 1);
        setResults([...out.filter((r) => !r.error)]);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
    return out.filter((r) => !r.error);
  }

  async function analyze(v: Variants, res: PersonaResult[]) {
    if (!res.length) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variants: v, results: res, industry }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setAnalysis(data.analysis as Analysis);
    } catch {
      // Fall back to the deterministic analysis so the report still renders.
      setAnalysis(demoAnalysis(v, res));
    } finally {
      setAnalyzing(false);
    }
  }

  async function runLive() {
    if (variants.assetType === "website" && (!variants.imageA || !variants.imageB)) {
      setError("Upload a screenshot for both versions before running.");
      return;
    }
    setRounds([]);
    setRefineNote(null);
    setAnalysis(null);
    setTab("overview");
    const res = await runPanel(variants);
    setRounds([{ labelA: variants.labelA, labelB: variants.labelB, ...tally(res) }]);
    await analyze(variants, res);
  }

  function runDemo() {
    setError(null);
    setIsDemo(true);
    setTab("overview");
    const members = buildPanel(industry, messageType);
    const res = members.map((m) => demoResult(m.persona, m.base));
    setResultsAsset(variants.assetType);
    setResults(res);
    setPanelSize(members.length);
    setDone(members.length);
    setRefineNote(null);
    setRounds([{ labelA: variants.labelA, labelB: variants.labelB, ...tally(res) }]);
    setAnalysis(demoAnalysis(variants, res));
  }

  async function refineLoop() {
    stopRef.current = false;
    setRefining(true);
    let v = variants;
    let res = results;
    let outcome: string | null = null;
    const startTally = tally(res);
    let bestGive = Math.max(startTally.givesA, startTally.givesB);
    let bestLabel = startTally.givesA >= startTally.givesB ? v.labelA : v.labelB;
    let ranAny = false;

    for (let i = 0; i < MAX_REFINE_ROUNDS; i++) {
      if (stopRef.current) {
        outcome = `Stopped after ${i} round${i === 1 ? "" : "s"}. Best so far: "${bestLabel}" at ${bestGive}/${res.length} would-convert.`;
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Refinement failed.");
        outcome = `Refinement stopped on an error. Best so far: "${bestLabel}" at ${bestGive}/${res.length} would-convert.`;
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
        setRefineNote(`"${roundLabel}" lifted would-convert to ${roundGive}/${newRes.length} — new best, refining again…`);
        if (i === MAX_REFINE_ROUNDS - 1) {
          outcome = `Round budget reached (${MAX_REFINE_ROUNDS} rounds). Still improving — best is "${bestLabel}" at ${bestGive}/${newRes.length} would-convert. Run auto-refine again to keep going.`;
        }
        continue;
      }
      outcome = `Plateau reached: round ${i + 2} (${roundGive}/${newRes.length}) did not beat the best would-convert score (${bestGive}/${newRes.length}). Ready version: "${bestLabel}".`;
      break;
    }

    if (!outcome && !ranAny) outcome = "Nothing to refine yet — run a test first.";
    // Re-analyze the final panel so the report reflects the refined winner.
    if (ranAny) await analyze(v, res);
    setRefineNote(outcome);
    setRefining(false);
  }

  const winners = {
    a: results.filter((r) => r.winner === "send_a").length,
    b: results.filter((r) => r.winner === "send_b").length,
  };
  const givers = (k: "intentA" | "intentB") =>
    results.filter((r) => ["give_small", "give_suggested", "give_more"].includes(r[k])).length;

  // Compact A-vs-B comparison bars — every metric on a "share of the panel"
  // basis so the numbers are directly comparable, with a plain caption each.
  const n = results.length || 1;
  const gA = givers("intentA");
  const gB = givers("intentB");
  const mean = (key: "resonanceA" | "resonanceB") =>
    results.length ? results.reduce((s, r) => s + (r[key] || 0), 0) / results.length : 0;
  const trustA = results.filter((r) => r.trust === "version_a").length;
  const trustB = results.filter((r) => r.trust === "version_b").length;
  const neitherCount = results.filter((r) => r.winner === "neither").length;
  const eitherNeither = n - winners.a - winners.b;
  const pct = (k: number) => Math.round((k / n) * 100);

  const compareRows: {
    label: string;
    a: number;
    b: number;
    max: number;
    fmt: (v: number) => string;
    caption: string;
  }[] = [
    {
      label: "Would act on it",
      a: gA,
      b: gB,
      max: n,
      fmt: (v) => `${v} · ${pct(v)}%`,
      caption: `took the action the message asked for (of ${n})`,
    },
    {
      label: "Preferred this version",
      a: winners.a,
      b: winners.b,
      max: n,
      fmt: (v) => `${v}`,
      caption: `head-to-head pick · ${eitherNeither} chose either or neither`,
    },
    {
      label: "Felt more trustworthy",
      a: trustA,
      b: trustB,
      max: n,
      fmt: (v) => `${v}`,
      caption: `${n - trustA - trustB} found them equal or neither`,
    },
    {
      label: "Emotional pull",
      a: mean("resonanceA"),
      b: mean("resonanceB"),
      max: 5,
      fmt: (v) => `${v.toFixed(1)} / 5`,
      caption: "mean resonance rating, 1–5",
    },
  ];

  // A clean, data-driven verdict line — avoids leaning on the model's (sometimes
  // awkward) auto-generated labels for the headline.
  function verdictLine(): string {
    if (!analysis) return "";
    if (analysis.verdict === "rework")
      return `Most of the panel would act on neither version — ${neitherCount} of ${n} rejected both.`;
    if (analysis.verdict === "tie")
      return `Too close to call — ${gA} vs ${gB} of ${n} would act on it.`;
    const win = analysis.verdict === "ship_a" ? "A" : "B";
    return `Version ${win} converted more of the panel — ${Math.max(gA, gB)} vs ${Math.min(gA, gB)} of ${n} would act.`;
  }

  // How much to trust the call — driven by whether the two reply-rate confidence
  // intervals overlap (non-overlap = a real separation at this panel size).
  function confidence(): { level: 0 | 1 | 2 | 3; label: string; note: string } | null {
    if (!analysis || !results.length) return null;
    if (analysis.verdict === "rework")
      return { level: 1, label: "Rework", note: `${neitherCount} of ${n} would act on neither version` };
    if (analysis.verdict === "tie")
      return { level: 1, label: "Low", note: "the two versions are within noise of each other" };
    const a = wilson(gA, n);
    const b = wilson(gB, n);
    const overlap = Math.min(a.high, b.high) - Math.max(a.low, b.low);
    if (overlap <= 0) return { level: 3, label: "High", note: "the reply-rate intervals don't overlap" };
    if (overlap < 0.12) return { level: 2, label: "Moderate", note: `a clear lead, though the intervals still touch at n=${n}` };
    return { level: 1, label: "Low", note: `the intervals overlap — read as directional at n=${n}` };
  }

  // The single concrete next step to take on this recommendation.
  function nextStep(): string {
    if (!analysis) return "";
    const topHigh = analysis.actions?.find((a) => a.priority === "high") ?? analysis.actions?.[0];
    if (analysis.verdict === "tie")
      return `Refine the weaker version and re-test${canRefine ? " (try Auto-refine below)" : ""}, or decide on other factors — the panel can't separate them yet.`;
    if (analysis.verdict === "rework")
      return topHigh ? topHigh.action : "Rework the core offer before running another test.";
    const win = analysis.verdict === "ship_a" ? variants.labelA : variants.labelB;
    const letter = analysis.verdict === "ship_a" ? "A" : "B";
    return topHigh
      ? `Ship Version ${letter} (“${win}”) — but first: ${topHigh.action.replace(/\.$/, "")}.`
      : `Ship Version ${letter} (“${win}”) as-is.`;
  }

  const canRefine = !isDemo && resultsAsset !== "website";

  // A representative reaction for a segment: prefer one whose vote matches the
  // verdict (a decisive voice), else the first with a real rationale.
  function segQuote(segment: string): string | null {
    const rs = results.filter((r) => r.giving === segment && r.rationale && r.rationale.length > 12);
    if (!rs.length) return null;
    const want =
      analysis?.verdict === "ship_a" ? "send_a" : analysis?.verdict === "ship_b" ? "send_b" : null;
    const pick = (want && rs.find((r) => r.winner === want)) || rs[0];
    return pick.rationale;
  }

  // Plain-text summary a rep can paste into an email or doc.
  function summaryText(): string {
    if (!analysis) return "";
    const c = confidence();
    const L = [
      `MESSAGE TEST — ${VERDICT_LABEL[analysis.verdict]}`,
      verdictLine(),
      c ? `Confidence: ${c.label} — ${c.note}.` : "",
      `Next: ${nextStep()}`,
      "",
      `A "${variants.labelA}" vs B "${variants.labelB}" · ${results.length} simulated reactions`,
      `Head-to-head: A ${winners.a} / B ${winners.b}. Would convert: A ${givers("intentA")} / B ${givers("intentB")} (of ${results.length}).`,
    ];
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

  return (
    <>
      <div className="pagehead">
        <h1>A/B message test</h1>
        <p>
          Pick an industry, see the audience &amp; analyst bots that will work on it, then test two
          versions of a message against them — with an executive read of the results, not a wall of
          charts.
        </p>
      </div>

      {/* Industry + the bots */}
      <section className="card">
        <h2>1 · Industry &amp; panel</h2>
        <div className="grid2" style={{ marginBottom: 4 }}>
          <div>
            <label className="fld">Industry</label>
            <select
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
            <label className="fld">Asset type</label>
            <div className="seg" role="tablist" aria-label="Asset type">
              {(Object.keys(ASSET_LABELS) as AssetType[]).map((t) => (
                <button
                  key={t}
                  className={variants.assetType === t ? "on" : ""}
                  onClick={() => setVariants({ ...variants, assetType: t })}
                  disabled={running || refining}
                >
                  {ASSET_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="sub" style={{ margin: "16px 0 8px" }}>
          <strong>Audience bots</strong> — {archetypes.length} archetypes react as your panel
          ({plannedSize} reactions total)
          {variants.assetType !== "website" && messageAudienceKey(messageType) ? (
            <>
              , led by a <b style={{ color: "var(--ink)" }}>{archetypes[0].name}</b> for a{" "}
              {messageType.toLowerCase()}
            </>
          ) : null}
          :
        </p>
        <div className="botgrid">
          {archetypes.map((a) => (
            <div className="botcard" key={a.name}>
              <div className="bt">
                <span className="ico">{monogram(a.name)}</span>
                {a.name}
              </div>
              <div className="bh">{a.how}</div>
            </div>
          ))}
        </div>

        <p className="sub" style={{ margin: "16px 0 8px" }}>
          <strong>Analyst bots</strong> — specialists that interpret the reactions into your report:
        </p>
        <div className="botgrid">
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
      </section>

      {/* Variants */}
      <section className="card">
        <h2>2 · Message variants</h2>
        <p className="sub">{ASSET_HINTS[variants.assetType]}</p>
        {variants.assetType !== "website" && (
          <div className="craftbar">
            <div className="craftfield">
              <label className="fld">Auto-craft a…</label>
              <select
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
            <button
              className="btn primary"
              onClick={() => autoCraft()}
              disabled={drafting || running || refining}
            >
              {drafting ? "Crafting…" : "Auto-craft variants"}
            </button>
            <span className="note">
              Claude drafts two A/B versions for {INDUSTRIES.find((i) => i.key === industry)?.label},
              or edit the sample / paste your own below.
            </span>
          </div>
        )}
        <div className="grid2">
          {(["A", "B"] as const).map((v) => {
            const labelKey = v === "A" ? "labelA" : "labelB";
            const copyKey = v === "A" ? "copyA" : "copyB";
            const imageKey = v === "A" ? "imageA" : "imageB";
            return (
              <div key={v}>
                <label className="fld">Version {v} label</label>
                <input
                  type="text"
                  value={variants[labelKey]}
                  onChange={(e) => setVariants({ ...variants, [labelKey]: e.target.value })}
                />
                {variants.assetType === "website" ? (
                  <>
                    <label className="fld" style={{ marginTop: 10 }}>
                      Version {v} screenshot
                    </label>
                    <div className="shot">
                      <input
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
                    <label className="fld" style={{ marginTop: 10 }}>
                      Version {v} copy
                    </label>
                    <textarea
                      className="grow"
                      ref={autoSize}
                      value={variants[copyKey]}
                      onChange={(e) => {
                        setVariants({ ...variants, [copyKey]: e.target.value });
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
              ? `${done}/${panelSize} reactions`
              : results.length
                ? isDemo
                  ? "Demo data (deterministic, no API calls)"
                  : `${results.length} reactions completed`
                : `~1–2 min · ${plannedSize} reactions · a few dollars in API usage`}
          </span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2>Variant history</h2>
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

      {results.length > 0 && (
        <>
          {/* Verdict hero */}
          <section className="card verdict">
            <div className="vtop">
              <div className="vlabel">Recommendation</div>
              {analysis && (
                <button className="copybtn" onClick={copySummary} title="Copy the verdict and reasoning as text">
                  {copied ? "Copied ✓" : "Copy summary"}
                </button>
              )}
            </div>
            <div className="vhead">
              <span className={`vbadge ${analysis?.verdict ?? "tie"}`}>
                {analyzing ? "Analyzing…" : analysis ? VERDICT_LABEL[analysis.verdict] : "—"}
              </span>
              {analysis && <div className="vheadline">{verdictLine()}</div>}
            </div>
            {analyzing && <p className="note">The analyst bots are interpreting the reactions…</p>}
            {analysis && (() => {
              const c = confidence();
              return (
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
                </>
              );
            })()}
            <div className="vmeta">
              A · {variants.labelA} &nbsp;vs&nbsp; B · {variants.labelB}
            </div>
            <div className="vmeta">
              {results.length} reactions · {INDUSTRIES.find((i) => i.key === industry)?.label} ·{" "}
              {ASSET_LABELS[resultsAsset]}
            </div>
          </section>

          {/* One tab bar for the whole analysis — recommendation stays pinned above */}
          <section className="card">
            <div className="tabs">
              {([
                ["overview", "Overview"],
                ["reasoning", "Why & fixes"],
                ["segments", "By segment"],
                ["analysts", "Analysts"],
                ["reactions", "Reactions"],
                ["data", "Data"],
                ...(canRefine ? ([["refine", "Refine"]] as [Tab, string][]) : []),
              ] as [Tab, string][]).map(([k, lbl]) => (
                <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {lbl}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="tabbody">
                <div className="kpirow">
                  <div className="kpi">
                    <div className="kpi-h">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.6"/></svg>
                      Panel
                    </div>
                    <div className="kpi-v"><span className="kpi-num">{results.length}</span><span className="kpi-sub">reactions</span></div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-h">
                      <span className="dot" style={{ background: "var(--series-a)" }} />Would act · A
                    </div>
                    <div className="kpi-v">
                      <span className="kpi-num">{gA}</span>
                      <span className={`trend ${gA === gB ? "flat" : gA > gB ? "up" : "down"}`}>
                        {gA === gB ? "even" : `${gA > gB ? "▲" : "▼"} ${Math.abs(gA - gB)} vs B`}
                      </span>
                    </div>
                    <div className="kpi-foot">{pct(gA)}% of panel</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-h">
                      <span className="dot" style={{ background: "var(--series-b)" }} />Would act · B
                    </div>
                    <div className="kpi-v">
                      <span className="kpi-num">{gB}</span>
                      <span className={`trend ${gA === gB ? "flat" : gB > gA ? "up" : "down"}`}>
                        {gA === gB ? "even" : `${gB > gA ? "▲" : "▼"} ${Math.abs(gA - gB)} vs A`}
                      </span>
                    </div>
                    <div className="kpi-foot">{pct(gB)}% of panel</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-h">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      Rejected both
                    </div>
                    <div className="kpi-v"><span className="kpi-num">{neitherCount}</span><span className="kpi-sub">{pct(neitherCount)}%</span></div>
                    <div className="kpi-foot">would act on neither</div>
                  </div>
                </div>

                <h3 className="tabh">How the panel responded</h3>
                <div className="compare">
                  {compareRows.map((row) => {
                    const win = row.a === row.b ? null : row.a > row.b ? "a" : "b";
                    return (
                      <div className="cmp" key={row.label}>
                        <div className="cmp-head">
                          <span className="cmp-label">{row.label}</span>
                          {win && <span className={`cmp-win ${win}`}>{win.toUpperCase()} leads</span>}
                        </div>
                        {(["a", "b"] as const).map((side) => {
                          const val = side === "a" ? row.a : row.b;
                          return (
                            <div className="cmp-bar" key={side}>
                              <span className="cmp-k">{side.toUpperCase()}</span>
                              <div className="cmp-track">
                                <div
                                  className={`cmp-fill ${side}${win && win !== side ? " lose" : ""}`}
                                  style={{ width: `${Math.max(3, (val / row.max) * 100)}%` }}
                                />
                              </div>
                              <span className="cmp-v">{row.fmt(val)}</span>
                            </div>
                          );
                        })}
                        <div className="cmp-cap">{row.caption}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="statnote" style={{ marginTop: 18 }}>
                  &ldquo;Would act&rdquo; shares carry a 95% confidence interval — {shareWithCI(gA, results.length)} for A,{" "}
                  {shareWithCI(gB, results.length)} for B — so read small gaps as directional.
                </p>
                <h3 className="tabh">How the panel voted</h3>
                <VoteDonut results={results} />
              </div>
            )}

            {tab === "reasoning" && (
              <div className="tabbody">
                {analysis && (
                  <>
                    {analysis.keyPoints && analysis.keyPoints.length > 0 && (
                      <>
                        <h3 className="tabh" style={{ marginTop: 0 }}>
                          Why this verdict
                        </h3>
                        <ol className="keypoints">
                          {analysis.keyPoints.map((k, i) => (
                            <li key={i}>
                              <div className="kp-point">{k.point}</div>
                              <div className="kp-why">{k.why}</div>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                    <h3 className="tabh" style={analysis.keyPoints?.length ? undefined : { marginTop: 0 }}>
                      What to do next
                    </h3>
                    <ul className="actionlist">
                      {analysis.actions.map((a, i) => (
                        <li key={i}>
                          <span className={`pri ${a.priority}`}>{a.priority}</span>
                          {a.action}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {tab === "segments" && (
              <div className="tabbody">
                {analysis && (
                  <div className="segcards">
                    {analysis.segments.map((s, i) => {
                      const q = segQuote(s.segment);
                      return (
                        <div className="segcard" key={i}>
                          <div className="st">{segmentLabel(s.segment)}</div>
                          <div className="sl"><b>Driver:</b> {s.driver}</div>
                          <div className="sl"><b>Barrier:</b> {s.barrier}</div>
                          <div className="sl muted">{s.divergence}</div>
                          {q && <div className="segquote">&ldquo;{q}&rdquo;</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <Legend labelA={variants.labelA} labelB={variants.labelB} />
                <ResonanceChart results={results} />
              </div>
            )}

            {tab === "analysts" && (
              <div className="tabbody">
                {analysis ? (
                  <div className="analystlist">
                    {analysis.analysts.map((a, i) => {
                      const meta = ANALYSTS.find((x) => x.key === a.key);
                      return (
                        <div className="analystrow" key={i}>
                          <div className="al"><span className="ico">{monogram(meta?.label ?? a.key)}</span>{meta?.label ?? a.key}</div>
                          <div className="ar">{a.read}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="note">Analyst reads appear once analysis completes.</p>
                )}
              </div>
            )}

            {tab === "reactions" && (() => {
              const voteLabel = (w: string) =>
                w === "send_a" ? "Prefers A" : w === "send_b" ? "Prefers B" : w === "either" ? "Either" : "Neither";
              const voteCls = (w: string) => (w === "send_a" ? "a" : w === "send_b" ? "b" : "n");
              const votes = [
                { key: "all", label: "All" },
                { key: "send_a", label: "Prefer A" },
                { key: "send_b", label: "Prefer B" },
                { key: "either", label: "Either" },
                { key: "neither", label: "Neither" },
              ] as const;
              const voteCount = (k: string) => (k === "all" ? results.length : results.filter((r) => r.winner === k).length);
              const segs = results.reduce<string[]>((a, r) => (a.includes(r.giving) ? a : [...a, r.giving]), []);
              const filtered = results.filter(
                (r) => (reactVote === "all" || r.winner === reactVote) && (reactSeg === "all" || r.giving === reactSeg)
              );
              return (
                <div className="tabbody">
                  <p className="sub">
                    Every persona&apos;s reason for its pick. Filter to talk through a group — say, everyone who
                    preferred B, or just the skeptics.
                  </p>
                  <div className="rfilters">
                    {votes.map((v) => (
                      <button
                        key={v.key}
                        className={`rfchip ${voteCls(v.key)} ${reactVote === v.key ? "on" : ""}`}
                        onClick={() => setReactVote(v.key)}
                        disabled={v.key !== "all" && voteCount(v.key) === 0}
                      >
                        {v.key === "send_a" && <span className="sw" style={{ background: "var(--series-a)" }} />}
                        {v.key === "send_b" && <span className="sw" style={{ background: "var(--series-b)" }} />}
                        {v.label} <em>{voteCount(v.key)}</em>
                      </button>
                    ))}
                  </div>
                  <div className="rfilters seg">
                    <button className={`segchip ${reactSeg === "all" ? "on" : ""}`} onClick={() => setReactSeg("all")}>
                      All segments
                    </button>
                    {segs.map((s) => (
                      <button
                        key={s}
                        className={`segchip ${reactSeg === s ? "on" : ""}`}
                        onClick={() => setReactSeg((cur) => (cur === s ? "all" : s))}
                      >
                        {segmentLabel(s)} <em>{results.filter((r) => r.giving === s).length}</em>
                      </button>
                    ))}
                  </div>
                  {filtered.length === 0 ? (
                    <p className="note" style={{ marginTop: 14 }}>No reactions match this filter.</p>
                  ) : (
                    filtered.map((r) => (
                      <div key={r.personaId} className={`quote ${voteCls(r.winner)}`}>
                        <div className="qtop">
                          <span className={`votepill ${voteCls(r.winner)}`}>{voteLabel(r.winner)}</span>
                          <span className="qseg">{segmentLabel(r.giving)}</span>
                        </div>
                        {r.rationale}
                      </div>
                    ))
                  )}
                </div>
              );
            })()}

            {tab === "data" && (
              <div className="tabbody">
                <Legend labelA={variants.labelA} labelB={variants.labelB} />
                <IntentChart results={results} labels={INTENT_LABELS[resultsAsset]} />
                <details className="tbl" style={{ marginTop: 16 }}>
                  <summary>Full results table ({results.length} reactions)</summary>
                  <table className="results">
                    <thead>
                      <tr>
                        <th>Bot</th><th>Segment</th><th>Intent A</th><th>Intent B</th>
                        <th>Res. A</th><th>Res. B</th><th>Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.personaId}>
                          <td>{r.personaName}</td>
                          <td>{segmentLabel(r.giving)}</td>
                          <td>{INTENT_LABELS[resultsAsset][r.intentA]}</td>
                          <td>{INTENT_LABELS[resultsAsset][r.intentB]}</td>
                          <td>{r.resonanceA}</td>
                          <td>{r.resonanceB}</td>
                          <td>{r.winner === "send_a" ? "A" : r.winner === "send_b" ? "B" : r.winner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
                <button
                  className="btn ghost"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    const manifest = {
                      app: "message-lab",
                      exportedAt: new Date().toISOString(),
                      industry,
                      assetType: resultsAsset,
                      model: results[0]?.model ?? "unknown",
                      panelSize: results.length,
                      isDemo,
                    };
                    const blob = new Blob(
                      [JSON.stringify({ manifest, variants, analysis, rounds, results }, null, 2)],
                      { type: "application/json" }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "message-lab-results.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export results JSON
                </button>
              </div>
            )}

            {tab === "refine" && canRefine && (
              <div className="tabbody">
                <h3 className="tabh" style={{ marginTop: 0 }}>Refine to a plateau</h3>
                <p className="sub">
                  Claude drafts a stronger challenger for the weaker version and re-runs the panel,
                  repeating while the conversion rate climbs and stopping when it plateaus — up to{" "}
                  {MAX_REFINE_ROUNDS} rounds, then it pauses.
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
                <p className="caveat" style={{ marginTop: 10 }}>
                  Same-model caveat: Claude drafts the challenger and Claude-simulated bots score it,
                  so a win can reflect the model preferring its own copy. Treat refined drafts as
                  strong candidates to test with people.
                </p>
                {rounds.length > 0 && (
                  <ol className="rounds">
                    {rounds.map((r, i) => (
                      <li key={i}>
                        <div>
                          <strong>Round {i + 1}</strong> · {r.labelA}{" "}
                          <b>{r.votesA}–{r.votesB}</b> {r.labelB}
                          <span className="note"> · would convert: {r.givesA} vs {r.givesB} · rejected both: {r.neither}</span>
                        </div>
                        {r.diagnosis && <div className="diag">{r.diagnosis}</div>}
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
              </div>
            )}

            <p className="caveat" style={{ margin: "20px 0 0" }}>
              Directional signal from {results.length} simulated reactions — persona-agent estimates,
              not statistically significant at this panel size and not a prediction of real-world
              behavior. Results depend on the persona model
              {results[0]?.model ? ` (${results[0].model})` : ""}; confirm important calls with a
              second model and a human read before you ship.
            </p>
          </section>
        </>
      )}
    </>
  );
}
