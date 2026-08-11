"use client";

import { useMemo, useState } from "react";
import personasJson from "@/lib/personas.json";
import type { AssetType, Persona, PersonaResult, Variants } from "@/lib/types";
import { ASSET_LABELS, GIVING_ORDER, INTENT_LABELS } from "@/lib/types";
import { demoResult } from "@/lib/demo";
import {
  DEFAULT_COPY_A,
  DEFAULT_COPY_B,
  DEFAULT_LABEL_A,
  DEFAULT_LABEL_B,
} from "@/lib/defaults";
import { IntentChart, Legend, ResonanceChart, WinnerChart } from "@/components/Charts";

const PERSONAS = personasJson as Persona[];
const CONCURRENCY = 4;

const ASSET_HINTS: Record<AssetType, string> = {
  email:
    "Paste the two versions you want to test. The prefilled copy is the pilot's sample appeal — replace it with real campaign copy.",
  direct_mail:
    "Paste the two letter versions. Include everything the recipient would read — headline, body, PS, reply-device copy.",
  website:
    "Upload a screenshot of each page version. A focused capture (hero, gift array, button) reads better than a very tall full-page one.",
};

// Downscale to Claude's vision sweet spot (long edge ≤ 1568px) and re-encode
// as JPEG so 24 fan-out requests stay well under serverless body limits.
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
  const [variants, setVariants] = useState<Variants>({
    assetType: "email",
    labelA: DEFAULT_LABEL_A,
    labelB: DEFAULT_LABEL_B,
    copyA: DEFAULT_COPY_A,
    copyB: DEFAULT_COPY_B,
  });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<PersonaResult[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllQuotes, setShowAllQuotes] = useState(false);
  // Asset type the current results were run under — labels must not shift if
  // the selector changes after a run.
  const [resultsAsset, setResultsAsset] = useState<AssetType>("email");

  const givingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of PERSONAS) m.set(p.giving, (m.get(p.giving) ?? 0) + 1);
    return GIVING_ORDER.map((g) => `${m.get(g) ?? 0} ${g.toLowerCase()}`).join(" · ");
  }, []);

  async function runLive() {
    if (variants.assetType === "website" && (!variants.imageA || !variants.imageB)) {
      setError("Upload a screenshot for both versions before running.");
      return;
    }
    setRunning(true);
    setResultsAsset(variants.assetType);
    setError(null);
    setResults([]);
    setIsDemo(false);
    setDone(0);
    setShowAllQuotes(false);
    const out: PersonaResult[] = [];
    const queue = [...PERSONAS];

    async function worker() {
      while (queue.length) {
        const persona = queue.shift();
        if (!persona) break;
        try {
          const resp = await fetch("/api/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ persona, variants }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          out.push(data as PersonaResult);
        } catch (e) {
          out.push({
            ...demoResult(persona),
            personaId: persona.id,
            error: e instanceof Error ? e.message : "failed",
          });
          setError(
            "Some persona runs failed — check that ANTHROPIC_API_KEY is set in Vercel project settings. Failed personas are excluded below."
          );
        }
        setDone((d) => d + 1);
        setResults([...out.filter((r) => !r.error)]);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  }

  function runDemo() {
    setError(null);
    setIsDemo(true);
    setShowAllQuotes(false);
    // Demo data is the email sample scenario — keep the selector honest.
    setVariants((v) => ({ ...v, assetType: "email" }));
    setResultsAsset("email");
    setResults(PERSONAS.map(demoResult));
    setDone(PERSONAS.length);
  }

  const winners = {
    a: results.filter((r) => r.winner === "send_a").length,
    b: results.filter((r) => r.winner === "send_b").length,
  };
  const givers = (k: "intentA" | "intentB") =>
    results.filter((r) => ["give_small", "give_suggested", "give_more"].includes(r[k])).length;

  return (
    <>
      <section className="card">
        <h2>1 · Appeal variants</h2>
        <div className="seg" role="tablist" aria-label="Asset type">
          {(Object.keys(ASSET_LABELS) as AssetType[]).map((t) => (
            <button
              key={t}
              className={variants.assetType === t ? "on" : ""}
              onClick={() => setVariants({ ...variants, assetType: t })}
              disabled={running}
            >
              {ASSET_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="sub">{ASSET_HINTS[variants.assetType]}</p>
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
                      value={variants[copyKey]}
                      onChange={(e) => setVariants({ ...variants, [copyKey]: e.target.value })}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>2 · Persona panel</h2>
        <p className="sub">
          {PERSONAS.length} simulated donors from the MatrAIx persona dataset, stratified by giving
          behavior: {givingCounts}.
        </p>
        <div className="runbar">
          <button className="btn primary" onClick={runLive} disabled={running}>
            {running ? "Running…" : "Run pre-test"}
          </button>
          <button className="btn ghost" onClick={runDemo} disabled={running}>
            Load demo results
          </button>
          {running && (
            <div className="progress">
              <div style={{ width: `${(done / PERSONAS.length) * 100}%` }} />
            </div>
          )}
          <span className="note">
            {running
              ? `${done}/${PERSONAS.length} personas`
              : results.length
                ? isDemo
                  ? "Demo data (deterministic, no API calls)"
                  : `${results.length} personas completed`
                : "~1–2 min · a few dollars in API usage"}
          </span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {results.length > 0 && (
        <>
          <section className="statrow">
            <div className="stat">
              <div className="v">
                {winners.a !== winners.b && (
                  <span
                    className="sw"
                    style={{
                      background: winners.a > winners.b ? "var(--series-a)" : "var(--series-b)",
                    }}
                  />
                )}
                {winners.a > winners.b ? "A" : winners.b > winners.a ? "B" : "Tie"}
              </div>
              <div className="k">Winning version</div>
              <div className="d">
                {winners.a} vs {winners.b} head-to-head votes
              </div>
            </div>
            <div className="stat">
              <div className="v">
                <span className="sw" style={{ background: "var(--series-a)" }} />
                {givers("intentA")}
              </div>
              <div className="k">Would give — Version A</div>
              <div className="d">of {results.length} personas</div>
            </div>
            <div className="stat">
              <div className="v">
                <span className="sw" style={{ background: "var(--series-b)" }} />
                {givers("intentB")}
              </div>
              <div className="k">Would give — Version B</div>
              <div className="d">of {results.length} personas</div>
            </div>
            <div className="stat">
              <div className="v">{results.filter((r) => r.winner === "neither").length}</div>
              <div className="k">Rejected both</div>
              <div className="d">signal to rework the appeal</div>
            </div>
          </section>

          <section className="card">
            <Legend labelA={variants.labelA} labelB={variants.labelB} />
            <WinnerChart results={results} />
          </section>

          <section className="card">
            <Legend labelA={variants.labelA} labelB={variants.labelB} />
            <IntentChart results={results} labels={INTENT_LABELS[resultsAsset]} />
          </section>

          <section className="card">
            <Legend labelA={variants.labelA} labelB={variants.labelB} />
            <ResonanceChart results={results} />
          </section>

          <section className="card">
            <h2>What moved them</h2>
            <p className="sub">Each persona&apos;s stated reason, tagged by their winner vote.</p>
            {results.slice(0, showAllQuotes ? results.length : 12).map((r) => (
              <div
                key={r.personaId}
                className={`quote ${r.winner === "send_a" ? "a" : r.winner === "send_b" ? "b" : ""}`}
              >
                {r.rationale}
                <div className="who">
                  {r.personaName} · {r.giving} · voted{" "}
                  {r.winner === "send_a"
                    ? "Version A"
                    : r.winner === "send_b"
                      ? "Version B"
                      : r.winner}
                </div>
              </div>
            ))}
            {results.length > 12 && (
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                onClick={() => setShowAllQuotes((s) => !s)}
              >
                {showAllQuotes ? "Show fewer" : `Show all ${results.length}`}
              </button>
            )}
          </section>

          <section className="card">
            <details className="tbl">
              <summary>Full results table ({results.length} personas)</summary>
              <table className="results">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Segment</th>
                    <th>Intent A</th>
                    <th>Intent B</th>
                    <th>Res. A</th>
                    <th>Res. B</th>
                    <th>Winner</th>
                    <th>Baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.personaId}>
                      <td>{r.personaName}</td>
                      <td>{r.giving}</td>
                      <td>{INTENT_LABELS[resultsAsset][r.intentA]}</td>
                      <td>{INTENT_LABELS[resultsAsset][r.intentB]}</td>
                      <td>{r.resonanceA}</td>
                      <td>{r.resonanceB}</td>
                      <td>
                        {r.winner === "send_a" ? "A" : r.winner === "send_b" ? "B" : r.winner}
                      </td>
                      <td>{r.baselineIntent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <button
              className="btn ghost"
              style={{ marginTop: 12 }}
              onClick={() => {
                const blob = new Blob([JSON.stringify({ variants, results }, null, 2)], {
                  type: "application/json",
                });
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
          </section>
        </>
      )}
    </>
  );
}
