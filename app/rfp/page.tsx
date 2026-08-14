"use client";

import { useState, useRef } from "react";
import {
  DEFAULT_COMMITTEE,
  newEvaluator,
  SAMPLE_RFP_INPUT,
  CRITERION_LABEL,
  VERDICT_LABEL,
  type RfpEvaluator,
  type RfpInput,
  type RfpResult,
  type CriterionKey,
} from "@/lib/rfp";
import { evaluateRfp } from "@/lib/rfpsim";

const band = (s: number) => (s >= 70 ? "hi" : s >= 50 ? "mid" : "lo");

export default function RfpPage() {
  const [input, setInput] = useState<RfpInput>({ offering: "", dealSize: "", competitor: "", rfp: "", proposal: "" });
  const [committee, setCommittee] = useState<RfpEvaluator[]>(DEFAULT_COMMITTEE);
  const [result, setResult] = useState<RfpResult | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const seq = useRef(1);
  const resultsRef = useRef<HTMLDivElement>(null);

  const edit = (patch: Partial<RfpInput>) => setInput((v) => ({ ...v, ...patch }));
  const editEval = (id: string, patch: Partial<RfpEvaluator>) => setCommittee((c) => c.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  async function readInto(which: "rfp" | "proposal", file: File) {
    try {
      const text = await file.text();
      edit({ [which]: text } as Partial<RfpInput>);
      setNotice(null);
    } catch {
      setNotice("Could not read that file — paste the text instead.");
    }
  }

  async function run() {
    if (!input.proposal.trim()) {
      setNotice("Add your proposal / RFP response to evaluate.");
      return;
    }
    setRunning(true);
    setNotice(null);
    try {
      const resp = await fetch("/api/rfp-eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ committee, input }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setResult(data.result);
      setModel(data.model);
      if (data.demo) setNotice("No API key — deterministic scoring shown. Add ANTHROPIC_API_KEY for a model read.");
      else if (data.warning) setNotice("Model evaluation hit an error; deterministic scoring shown instead.");
    } catch (e) {
      // Never leave the user stuck — fall back to the local engine.
      setResult(evaluateRfp(committee, input));
      setModel(null);
      setNotice((e instanceof Error ? e.message : "Evaluation failed") + " — showing local scoring.");
    } finally {
      setRunning(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  const totalW = committee.reduce((t, e) => t + e.weight, 0) || 1;

  return (
    <>
      <div className="pagehead">
        <h1>RFP Simulator</h1>
        <p>
          Before you submit, run your proposal past a simulated buying committee. See your win
          likelihood, a scorecard against how they&apos;ll actually evaluate it, where you&apos;d lose
          points, and exactly what to fix to win the deal.
        </p>
      </div>

      {/* 1 · The deal */}
      <section className="card">
        <h2 className="step">1 · The deal</h2>
        <div className="rfp-deal">
          <label className="fld">What you&apos;re selling
            <input type="text" value={input.offering} onChange={(e) => edit({ offering: e.target.value })} placeholder="e.g. Cloud data platform + implementation" />
          </label>
          <label className="fld">Deal size
            <input type="text" value={input.dealSize} onChange={(e) => edit({ dealSize: e.target.value })} placeholder="e.g. $180k / year" />
          </label>
          <label className="fld">Likely rival / incumbent (optional)
            <input type="text" value={input.competitor} onChange={(e) => edit({ competitor: e.target.value })} placeholder="e.g. Snowflake" />
          </label>
        </div>
      </section>

      {/* 2 · The RFP */}
      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>2 · The RFP <span className="note" style={{ fontWeight: 400 }}>· optional, improves requirements scoring</span></h2>
          <label className="btn ghost filebtn">
            Upload
            <input type="file" accept=".txt,.md,.text,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) readInto("rfp", f); e.currentTarget.value = ""; }} />
          </label>
        </div>
        <textarea className="rfp-ta" rows={6} value={input.rfp} onChange={(e) => edit({ rfp: e.target.value })} placeholder="Paste the RFP requirements / scoring criteria here…" />
      </section>

      {/* 3 · Your proposal */}
      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>3 · Your proposal</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {!input.proposal && !input.rfp && <button className="btn ghost" onClick={() => setInput(SAMPLE_RFP_INPUT)}>Load sample</button>}
            <label className="btn ghost filebtn">
              Upload
              <input type="file" accept=".txt,.md,.text,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) readInto("proposal", f); e.currentTarget.value = ""; }} />
            </label>
          </div>
        </div>
        <textarea className="rfp-ta" rows={10} value={input.proposal} onChange={(e) => edit({ proposal: e.target.value })} placeholder="Paste your proposal / RFP response here…" />
      </section>

      {/* 4 · The committee */}
      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>4 · The buying committee</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={() => setCommittee(DEFAULT_COMMITTEE)}>Reset</button>
            <button className="btn ghost" onClick={() => setCommittee((c) => [...c, newEvaluator(seq.current++)])}>+ Add evaluator</button>
          </div>
        </div>
        <p className="note" style={{ marginTop: 0 }}>Each role scores from its lens; weights set how much it sways the decision.</p>
        <div className="evalgrid">
          {committee.map((ev) => (
            <div className="evalcard" key={ev.id}>
              <div className="evaltop">
                <input className="evalrole" value={ev.role} onChange={(e) => editEval(ev.id, { role: e.target.value })} />
                <button className="xbtn" onClick={() => setCommittee((c) => (c.length > 1 ? c.filter((x) => x.id !== ev.id) : c))} title="Remove" aria-label="Remove evaluator">×</button>
              </div>
              <input className="evalfocus" value={ev.focus} onChange={(e) => editEval(ev.id, { focus: e.target.value })} />
              <div className="evalcares">{ev.cares.map((k) => <span key={k} className="carechip">{CRITERION_LABEL[k as CriterionKey]}</span>)}</div>
              <label className="evalw">Weight {Math.round((ev.weight / totalW) * 100)}%
                <input type="range" min={0.05} max={0.4} step={0.01} value={ev.weight} onChange={(e) => editEval(ev.id, { weight: Number(e.target.value) })} />
              </label>
            </div>
          ))}
        </div>
        <div className="runbar" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={run} disabled={running || !input.proposal.trim() || !committee.length}>
            {running ? "Scoring…" : "Score my proposal"}
          </button>
          {model && <span className="note" style={{ alignSelf: "center" }}>Model: {model}</span>}
        </div>
        {notice && <p className="note" style={{ marginTop: 10 }}>{notice}</p>}
      </section>

      {/* Results */}
      {result && (
        <div ref={resultsRef}>
          <section className={`card rfp-hero ${result.verdict}`}>
            <div className="rfp-herotop">
              <div className={`rfp-score ${band(result.winScore)}`}>{result.winScore}<span>%</span></div>
              <div>
                <div className="rfp-verdict-k">Win likelihood</div>
                <div className="rfp-verdict"><span className={`rfp-badge ${result.verdict}`}>{VERDICT_LABEL[result.verdict]}</span></div>
                <p className="rfp-headline">{result.headline}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="step">Scorecard</h2>
            <p className="sub">How the committee would score your proposal on each dimension.</p>
            <div className="scorecard">
              {result.criteria.map((c) => (
                <div className="scorerow" key={c.key}>
                  <div className="score-lbl">{c.label}</div>
                  <div className="score-track"><span className={band(c.score)} style={{ width: `${c.score}%` }} /></div>
                  <div className={`score-num ${band(c.score)}`}>{c.score}</div>
                  <div className="score-note">{c.note}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="step">The committee&apos;s read</h2>
            <p className="sub">What each stakeholder would say — their score, their concern, and what would win them over.</p>
            <div className="evalreads">
              {result.evaluators.map((ev) => (
                <div className="evalread" key={ev.id + ev.role}>
                  <div className="er-h">
                    <span className="er-role">{ev.role}</span>
                    <span className={`er-score ${band(ev.score)}`}>{ev.score}</span>
                  </div>
                  <div className="er-verdict">{ev.verdict}</div>
                  <div className="er-line"><span className="er-k concern">Concern</span> {ev.concern}</div>
                  <div className="er-line"><span className="er-k win">To win them</span> {ev.wouldWin}</div>
                </div>
              ))}
            </div>
          </section>

          {(result.gaps.length > 0 || result.actions.length > 0) && (
            <section className="card">
              <div className="rfp-cols">
                {result.gaps.length > 0 && (
                  <div>
                    <h2 className="step">Where you&apos;d lose points</h2>
                    <ul className="gaplist">
                      {result.gaps.map((g, i) => (
                        <li key={i}><span className={`sev sev-${g.severity}`}>{g.severity}</span> {g.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.actions.length > 0 && (
                  <div>
                    <h2 className="step">Fixes to raise your win rate</h2>
                    <ul className="actionlist">
                      {result.actions.map((a, i) => (
                        <li key={i}><span className={`pri ${a.priority}`}>{a.priority}</span> {a.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          <p className="caveat" style={{ maxWidth: 1080, margin: "0 auto 40px" }}>
            A simulated evaluation from stakeholder personas, not a guarantee of the real award — use it to
            find and close gaps before you submit, not to predict the outcome. The more of the actual RFP you
            paste in, the sharper the requirements scoring.
          </p>
        </div>
      )}
    </>
  );
}
