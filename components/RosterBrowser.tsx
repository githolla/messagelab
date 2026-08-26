"use client";

// The evaluator roster, spelled out — one card per evaluator, all 100,
// grouped by family with the family's own framing note. This component is
// self-contained (roster data + this file) so the proposal generator can
// lift it verbatim: see HANDOFF.md.

import { useState } from "react";
import {
  EVALUATORS, FAMILIES, JUDGE_POOL, byFamily, gateStatus,
  COST_TIER_LABEL, ROLE_LABEL, EXECUTED_BY_LABEL,
  type EvaluatorFamily,
} from "@/lib/gate/roster";

const FAMILY_COLORS: Record<EvaluatorFamily, string> = {
  A: "#2b45c4", B: "#0f766e", C: "#7c3aed", D: "#b45309", E: "#a21caf", F: "#0369a1", G: "#4d7c0f",
};

export default function RosterBrowser() {
  const [family, setFamily] = useState<EvaluatorFamily | "all">("all");
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(query);
  const shownFamilies = FAMILIES.filter((f) => family === "all" || f.key === family);
  const total = EVALUATORS.filter((e) =>
    (family === "all" || e.family === family) &&
    (!query || matches(e.id) || matches(e.name) || matches(e.brief) || matches(e.emits)),
  ).length;

  return (
    <>
      <div className="pagehead">
        <h1>The evaluator roster</h1>
        <p>
          All {EVALUATORS.length} evaluators, spelled out. This is <b>not a voting panel</b>: families A–C
          enumerate criteria and visibility scopes, D–F are checks (most deterministic — the D and F rows
          marked <em>running in the Gate</em> are live on the <a href="/gate">Proposal Gate</a>), and G runs
          on the assembled document. Actual scoring is performed by {JUDGE_POOL.size.min}–{JUDGE_POOL.size.max} judge
          models from disjoint families — never more than one per provider.
        </p>
      </div>

      <section className="card rjudge">
        <h2 className="step" style={{ marginTop: 0 }}>The judge pool <span className="note" style={{ fontWeight: 400 }}>· who actually scores</span></h2>
        <div className="rjudge-grid">
          <div><b>{JUDGE_POOL.size.min}–{JUDGE_POOL.size.max} models</b><span>{JUDGE_POOL.rule}</span></div>
          <div><b>{JUDGE_POOL.sampling.runsPerCriterion} runs / criterion</b><span>aggregated by {JUDGE_POOL.sampling.aggregate}</span></div>
          <div><b>Blinded to</b><span>{JUDGE_POOL.blinding.join(", ").replace(/_/g, " ")}</span></div>
          <div><b>Protocol</b><span>{JUDGE_POOL.reasoningProtocol.replace(/_/g, " ")} · {JUDGE_POOL.exclusion.toLowerCase()}</span></div>
        </div>
        <p className="note" style={{ marginTop: 8 }}>{JUDGE_POOL.rationale}</p>
      </section>

      <section className="card">
        <div className="rfilter">
          <div className="fmtchips" style={{ marginBottom: 0 }}>
            <button className={`fmtchip ${family === "all" ? "on" : ""}`} onClick={() => setFamily("all")}>All {EVALUATORS.length}</button>
            {FAMILIES.map((f) => (
              <button key={f.key} className={`fmtchip ${family === f.key ? "on" : ""}`} onClick={() => setFamily(f.key)}>
                {f.key} · {f.name} ({f.count})
              </button>
            ))}
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brief, or what it emits…" aria-label="Search evaluators" />
        </div>
        <p className="note" style={{ marginTop: 8 }}>{total} evaluator{total === 1 ? "" : "s"} shown</p>
      </section>

      {shownFamilies.map((f) => {
        const members = byFamily(f.key).filter((e) =>
          !query || matches(e.id) || matches(e.name) || matches(e.brief) || matches(e.emits));
        if (!members.length) return null;
        const color = FAMILY_COLORS[f.key];
        return (
          <section className="card" key={f.key}>
            <div className="rfam-head" style={{ borderLeft: `4px solid ${color}` }}>
              <h2 className="step" style={{ margin: 0 }}>
                <span className="rfam-key" style={{ background: color }}>{f.key}</span> {f.name}
                <span className="note" style={{ fontWeight: 400 }}> · {members.length} of {f.count}</span>
              </h2>
              <p className="sub" style={{ marginTop: 6 }}>{f.note}</p>
            </div>
            <div className="rgrid">
              {members.map((e) => {
                const gs = gateStatus(e.id);
                return (
                  <article className="rcard" key={e.id}>
                    <div className="rcard-top">
                      <span className="rcard-id" style={{ background: color }}>{e.id}</span>
                      <h3 className="rcard-name">{e.name}</h3>
                    </div>
                    <p className="rcard-brief">{e.brief}</p>
                    <p className="rcard-emits"><b>Emits:</b> {e.emits}</p>
                    <div className="rcard-tags">
                      <span className="rtag">{ROLE_LABEL[e.role]}</span>
                      <span className="rtag">{e.kind.replace(/_/g, " ")}</span>
                      <span className="rtag" title={EXECUTED_BY_LABEL[e.executedBy]}>runs via {e.executedBy.replace(/_/g, " ")}</span>
                      <span className="rtag" title={COST_TIER_LABEL[e.costTier]}>tier {e.costTier}</span>
                      <span className="rtag">{e.selection === "always" ? "always runs" : e.selection === "exactly_one" ? "pick exactly one" : "runs on predicate"}</span>
                      {e.blocking && <span className="rtag block">blocking</span>}
                      {gs === "built" && <span className="rtag live">running in the Gate</span>}
                      {gs === "needs_artifact" && <span className="rtag hold">needs the PDF artifact</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
