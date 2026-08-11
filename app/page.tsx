"use client";

import { useMemo, useState } from "react";
import personasJson from "@/lib/personas.json";
import type { Persona, PersonaResult, Variants } from "@/lib/types";
import { GIVING_ORDER, INTENT_LABELS } from "@/lib/types";
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

export default function Home() {
  const [variants, setVariants] = useState<Variants>({
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

  const givingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of PERSONAS) m.set(p.giving, (m.get(p.giving) ?? 0) + 1);
    return GIVING_ORDER.map((g) => `${m.get(g) ?? 0} ${g.toLowerCase()}`).join(" · ");
  }, []);

  async function runLive() {
    setRunning(true);
    setError(null);
    setResults([]);
    setIsDemo(false);
    setDone(0);
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
        <p className="sub">
          Paste the two versions you want to test. The prefilled copy is the pilot&apos;s sample
          appeal — replace it with real campaign copy.
        </p>
        <div className="grid2">
          <div>
            <label className="fld">Version A label</label>
            <input
              type="text"
              value={variants.labelA}
              onChange={(e) => setVariants({ ...variants, labelA: e.target.value })}
            />
            <label className="fld" style={{ marginTop: 10 }}>Version A copy</label>
            <textarea
              value={variants.copyA}
              onChange={(e) => setVariants({ ...variants, copyA: e.target.value })}
            />
          </div>
          <div>
            <label className="fld">Version B label</label>
            <input
              type="text"
              value={variants.labelB}
              onChange={(e) => setVariants({ ...variants, labelB: e.target.value })}
            />
            <label className="fld" style={{ marginTop: 10 }}>Version B copy</label>
            <textarea
              value={variants.copyB}
              onChange={(e) => setVariants({ ...variants, copyB: e.target.value })}
            />
          </div>
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
          {(running || results.length > 0) && (
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
                {winners.a > winners.b ? "A" : winners.b > winners.a ? "B" : "Tie"}
              </div>
              <div className="k">Winning version</div>
              <div className="d">
                {winners.a} vs {winners.b} head-to-head votes
              </div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--series-a)" }}>{givers("intentA")}</div>
              <div className="k">Would give — Version A</div>
              <div className="d">of {results.length} personas</div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: "var(--series-b)" }}>{givers("intentB")}</div>
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
            <IntentChart results={results} />
          </section>

          <section className="card">
            <Legend labelA={variants.labelA} labelB={variants.labelB} />
            <ResonanceChart results={results} />
          </section>

          <section className="card">
            <h2>What moved them</h2>
            <p className="sub">Each persona&apos;s stated reason, tagged by their winner vote.</p>
            {results.slice(0, 12).map((r) => (
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
                      <td>{INTENT_LABELS[r.intentA]}</td>
                      <td>{INTENT_LABELS[r.intentB]}</td>
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
