"use client";

// The Deterministic Gate — thirty model-free checks against a proposal + its
// RFP, run entirely in the browser. Zero model calls, no API key. Optionally
// diff two drafts side by side. `blocking > 0` = do not ship.

import { useState } from "react";
import type { GateContext, GateFinding, GateRun } from "@/lib/gate/model";
import { GATE_CHECKS } from "@/lib/gate/model";
import { runGate, diffGate, type GateDiffRow } from "@/lib/gate/run";
import { SAMPLE_RFP, SAMPLE_DRAFT, SAMPLE_REBUILD, SAMPLE_CONTEXT_JSON } from "@/lib/gate/sample";

const VERDICT_LABEL: Record<GateFinding["verdict"], string> = {
  deficiency: "Deficiency", weakness: "Weakness", pass: "Pass", skipped: "Skipped",
};

function parseContext(json: string): { ctx: GateContext; error: string | null } {
  const t = json.trim();
  if (!t) return { ctx: {}, error: null };
  try {
    const parsed = JSON.parse(t);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ctx: {}, error: "Context must be a JSON object." };
    }
    return { ctx: parsed as GateContext, error: null };
  } catch (e) {
    return { ctx: {}, error: `Context JSON doesn't parse: ${e instanceof Error ? e.message : "syntax error"}` };
  }
}

function FindingRow({ f }: { f: GateFinding }) {
  const [open, setOpen] = useState(false);
  const shown = open ? f.examples : f.examples.slice(0, 3);
  return (
    <div className={`gfind ${f.verdict}`}>
      <div className="gfind-head">
        <span className="gfind-id">{f.id}</span>
        <span className={`gfind-verdict ${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span>
        {f.blocking && <span className="gfind-block">BLOCKING</span>}
        <span className="gfind-sum">{f.summary}</span>
      </div>
      {shown.length > 0 && (
        <ul className="gfind-ex">
          {shown.map((e, i) => (
            <li key={i}><span className="gfind-sec">[{e.section}]</span> {e.quote}</li>
          ))}
        </ul>
      )}
      {f.examples.length > 3 && (
        <button className="gfind-more" onClick={() => setOpen((o) => !o)}>
          {open ? "Show fewer" : `Show all ${f.examples.length}`}
        </button>
      )}
    </div>
  );
}

function Scorecard({ title, run }: { title: string; run: GateRun }) {
  const shippable = run.tally.blocking === 0;
  return (
    <section className="card">
      <div className="gscore-head">
        <h2 className="step" style={{ margin: 0 }}>{title}</h2>
        <span className={`gship ${shippable ? "ok" : "no"}`}>{shippable ? "Nothing blocking — clear to ship" : "DO NOT SHIP"}</span>
      </div>
      <div className="gtally">
        <div className="gt"><b>{run.tally.deficiencies}</b><span>deficiencies</span></div>
        <div className="gt"><b>{run.tally.weaknesses}</b><span>weaknesses</span></div>
        <div className="gt"><b>{run.tally.passes}</b><span>pass</span></div>
        <div className="gt"><b>{run.tally.skipped}</b><span>skipped</span></div>
        <div className={`gt ${run.tally.blocking ? "bad" : "good"}`}><b>{run.tally.blocking}</b><span>blocking</span></div>
      </div>
      <div className="gfinds">
        {run.findings.map((f) => <FindingRow key={f.id} f={f} />)}
      </div>
    </section>
  );
}

function DiffTable({ rows }: { rows: GateDiffRow[] }) {
  const cell = (f: GateFinding) => (
    <td className={`gd-${f.verdict}`}>
      {f.verdict === "skipped" ? "—" : `${f.count >= 0 ? f.count : ""} ${f.verdict === "pass" ? "pass" : f.verdict === "deficiency" ? "defi" : "weak"}`}
    </td>
  );
  return (
    <section className="card">
      <h2 className="step">Side by side</h2>
      <p className="sub">The same suite against both drafts. Counts are defects found per check.</p>
      <div className="gdiff-wrap">
        <table className="gdiff">
          <thead><tr><th>check</th><th></th><th>Draft A</th><th>Draft B</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="gd-id">{r.id}</td>
                <td className="gd-name">{r.name}</td>
                {cell(r.a)}
                {cell(r.b)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function GateTool() {
  const [rfp, setRfp] = useState("");
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const [compare, setCompare] = useState(false);
  const [ctxJson, setCtxJson] = useState("");
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [runA, setRunA] = useState<GateRun | null>(null);
  const [runB, setRunB] = useState<GateRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadSample() {
    setRfp(SAMPLE_RFP);
    setDraftA(SAMPLE_DRAFT);
    setDraftB(SAMPLE_REBUILD);
    setCtxJson(SAMPLE_CONTEXT_JSON);
    setCompare(true);
    setRunA(null);
    setRunB(null);
    setError(null);
    setCtxError(null);
  }

  function run() {
    if (!draftA.trim()) { setError("Paste the proposal to run the gate against."); return; }
    const { ctx, error: cerr } = parseContext(ctxJson);
    setCtxError(cerr);
    if (cerr) { setError("Fix the context JSON (or clear it) before running."); return; }
    setError(null);
    const year = new Date().getFullYear();
    setRunA(runGate(draftA, rfp, ctx, year));
    setRunB(compare && draftB.trim() ? runGate(draftB, rfp, ctx, year) : null);
  }

  const diff = runA && runB ? diffGate(runA, runB) : null;
  const running = GATE_CHECKS.length - 1; // D68 needs the PDF artifact

  return (
    <>
      <div className="pagehead">
        <h1>The Deterministic Gate</h1>
        <p>
          Thirty model-free checks against a proposal and its RFP — placeholders, prescribed formats,
          arithmetic, compliance gaps, names and titles, reference relevance. A placeholder is present or it
          is not; a table sums or it does not. <b>Zero model calls, no API key.</b> Judges catch blatant
          errors and miss thin ones — code does not fill gaps in the author&apos;s favor. Anything blocking
          means the draft does not ship. These checks are families D and F of a 100-evaluator roster —{" "}
          <a href="/gate/evaluators">meet all 100 evaluators →</a>
        </p>
      </div>

      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>1 · The documents</h2>
          <button className="btn ghost" onClick={loadSample}>Load sample</button>
        </div>
        <label className="fld" htmlFor="gate-rfp" style={{ marginTop: 10 }}>The RFP <span className="note" style={{ fontWeight: 400 }}>· requirements, prescribed formats, and preferences are mined from it</span></label>
        <textarea id="gate-rfp" rows={6} value={rfp} onChange={(e) => setRfp(e.target.value)} placeholder="Paste the RFP text. Use headings (##, numbered, or ALL CAPS) to mark sections; tables as | pipe | rows |." />
        <label className="fld" htmlFor="gate-a" style={{ marginTop: 12 }}>The proposal{compare ? " — Draft A" : ""}</label>
        <textarea id="gate-a" rows={10} value={draftA} onChange={(e) => setDraftA(e.target.value)} placeholder="Paste the full proposal text." />
        <div style={{ marginTop: 10 }}>
          <label className="gate-cmp">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Compare a second draft (side-by-side diff)
          </label>
        </div>
        {compare && (
          <>
            <label className="fld" htmlFor="gate-b" style={{ marginTop: 12 }}>Draft B</label>
            <textarea id="gate-b" rows={10} value={draftB} onChange={(e) => setDraftB(e.target.value)} placeholder="Paste the revised draft." />
          </>
        )}
      </section>

      <section className="card">
        <h2 className="step">2 · Context registry <span className="note" style={{ fontWeight: 400 }}>· optional — unlocks the checks that need ground truth</span></h2>
        <p className="sub">
          Names + correct titles, references offered, case-study dimension profiles, the source registry,
          published aggregates, model inputs, stale prior-client terms. Checks that need a piece of this and
          don&apos;t get it report <em>skipped</em>, never a silent pass. JSON — load the sample to see the shape.
        </p>
        <textarea rows={8} value={ctxJson} onChange={(e) => setCtxJson(e.target.value)} placeholder='{ "people": [{ "name": "…", "title": "…" }], "referencesOffered": ["…"], "staleTerms": ["…"] }' spellCheck={false} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
        {ctxError && <p className="error">{ctxError}</p>}
      </section>

      <section className="card">
        <div className="runbar" style={{ marginTop: 0 }}>
          <button className="btn primary" onClick={run} disabled={!draftA.trim()}>Run the gate</button>
          <span className="note">{running} of {GATE_CHECKS.length} checks run on pasted text · D68 (PDF accessibility) needs the artifact itself · instant &amp; free</span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {runA && <Scorecard title={runB ? "Draft A" : "The run"} run={runA} />}
      {runB && <Scorecard title="Draft B" run={runB} />}
      {diff && (
        <>
          <DiffTable rows={diff} />
          <section className="card">
            <h2 className="step">Totals</h2>
            <div className="gtot">
              <div><span>deficiencies</span><b>{runA!.tally.deficiencies}</b><b>{runB!.tally.deficiencies}</b></div>
              <div><span>weaknesses</span><b>{runA!.tally.weaknesses}</b><b>{runB!.tally.weaknesses}</b></div>
              <div><span>blocking</span><b className={runA!.tally.blocking ? "bad" : "good"}>{runA!.tally.blocking}</b><b className={runB!.tally.blocking ? "bad" : "good"}>{runB!.tally.blocking}</b></div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
