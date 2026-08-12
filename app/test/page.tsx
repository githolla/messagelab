"use client";

import { useMemo, useRef, useState } from "react";
import type { AssetType, Persona, PersonaResult, Variants } from "@/lib/types";
import { ASSET_LABELS, INTENT_LABELS, segmentLabel } from "@/lib/types";
import { demoResult } from "@/lib/demo";
import { tally, type RoundSummary } from "@/lib/refine";
import { wilson } from "@/lib/stats";
import { INDUSTRIES } from "@/lib/industries";
import { ANALYSTS, panelFor, instancesPer, monogram, messageAudienceKey } from "@/lib/archetypes";
import { demoAnalysis, VERDICT_LABEL, type Analysis } from "@/lib/analysis";
import { sampleFor, isPristineCopy, MESSAGE_TYPES, messageTypesFor } from "@/lib/samples";
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
    const res = await runPanel(variants);
    setRounds([{ labelA: variants.labelA, labelB: variants.labelB, ...tally(res) }]);
    await analyze(variants, res);
  }

  function runDemo() {
    setError(null);
    setIsDemo(true);
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

          {/* The focus group — how the room split, then every participant */}
          {(() => {
            const eitherCount = results.filter((r) => r.winner === "either").length;
            const splitSegs = [
              { k: "send_a", n2: winners.a, label: "Chose A", color: "var(--series-a)" },
              { k: "send_b", n2: winners.b, label: "Chose B", color: "var(--series-b)" },
              { k: "either", n2: eitherCount, label: "No preference", color: "var(--neutral-bar)" },
              { k: "neither", n2: neitherCount, label: "Rejected both", color: "var(--line)" },
            ];
            const pickCls = (w: string) =>
              w === "send_a" ? "a" : w === "send_b" ? "b" : w === "either" ? "either" : "neither";
            const pickLabel = (w: string) =>
              w === "send_a" ? "Chose A" : w === "send_b" ? "Chose B" : w === "either" ? "No preference" : "Rejected both";
            const trustLabel = (t: string) =>
              t === "version_a" ? "Version A" : t === "version_b" ? "Version B" : t === "both_equal" ? "Both equally" : "Neither";
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
            return (
              <section className="card">
                <h2>The focus group</h2>
                <p className="sub">
                  {results.length} simulated participants each read both versions and reacted. Here&apos;s how the
                  room split — then what every participant said.
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
                <p className="groupstat">
                  Would act on it: A <b>{gA}</b> · B <b>{gB}</b>. &nbsp; Rated more trustworthy: A <b>{trustA}</b> · B{" "}
                  <b>{trustB}</b>. &nbsp; Avg resonance: A <b>{mean("resonanceA").toFixed(1)}</b> · B{" "}
                  <b>{mean("resonanceB").toFixed(1)}</b> (of 5).
                </p>

                {/* Participants */}
                <h3 className="tabh">Every participant</h3>
                <div className="rfilters">
                  {votes.map((v) => (
                    <button
                      key={v.key}
                      className={`rfchip ${pickCls(v.key)} ${reactVote === v.key ? "on" : ""}`}
                      onClick={() => setReactVote(v.key)}
                      disabled={v.key !== "all" && voteCount(v.key) === 0}
                    >
                      {v.label} <em>{voteCount(v.key)}</em>
                    </button>
                  ))}
                </div>
                <div className="rfilters seg">
                  <button className={`segchip ${reactSeg === "all" ? "on" : ""}`} onClick={() => setReactSeg("all")}>
                    All types
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

                <div className="participants">
                  {filtered.map((r) => (
                    <div key={r.personaId} className={`pcard ${pickCls(r.winner)}`}>
                      <div className="phead">
                        <span className="ico">{monogram(r.giving)}</span>
                        <div className="pwho">
                          <div className="pname">{r.personaName}</div>
                          <div className="pseg">{segmentLabel(r.giving)}</div>
                        </div>
                        <span className={`pick ${pickCls(r.winner)}`}>{pickLabel(r.winner)}</span>
                      </div>
                      <div className="preact">&ldquo;{r.rationale}&rdquo;</div>
                      <details className="pdetails">
                        <summary>Ratings &amp; intent</summary>
                        <div className="pdrow">
                          Rated: A <b>{r.resonanceA}/5</b> · B <b>{r.resonanceB}/5</b>
                        </div>
                        <div className="pdrow">
                          Would: A — {INTENT_LABELS[resultsAsset][r.intentA]} · B — {INTENT_LABELS[resultsAsset][r.intentB]}
                        </div>
                        <div className="pdrow">Trusted more: {trustLabel(r.trust)}</div>
                      </details>
                    </div>
                  ))}
                </div>
                {filtered.length === 0 && <p className="note">No participants match this filter.</p>}

                <p className="caveat" style={{ margin: "20px 0 0" }}>
                  Directional signal from {results.length} simulated participants — persona-agent estimates, not a
                  prediction of real-world behavior. Results depend on the persona model
                  {results[0]?.model ? ` (${results[0].model})` : ""}; confirm important calls with real people.
                </p>
              </section>
            );
          })()}

          {/* Auto-refine — optional, kept minimal */}
          {canRefine && (
            <section className="card">
              <h2>Refine to a plateau</h2>
              <p className="sub">
                Claude drafts a stronger challenger for the weaker version and re-runs the panel until the
                conversion rate plateaus — up to {MAX_REFINE_ROUNDS} rounds.
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
        </>
      )}
    </>
  );
}
