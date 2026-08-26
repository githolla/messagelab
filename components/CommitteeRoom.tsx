"use client";

// The live half of the roster: convene the committee. 22 family-A personas
// read their slice of the proposal in character (plus the family-G meta wave),
// shaped by one family-B lens and one family-C buyer state. Live model calls
// fan out one per persona, Focus-Group style; a per-persona deterministic
// fallback keeps the room full through partial outages. Demo needs no key.

import { useState } from "react";
import type { GateContext, GateRun } from "@/lib/gate/model";
import { parseDoc } from "@/lib/gate/parse";
import {
  committeeRoster, metaRoster, lensOptions, buyerStateOptions,
  visibleText, canVeto, gateBriefing, demoReaction, summarizeRoom,
  STANCE_LABEL, STANCES, ROOM_VERDICT_LABEL,
  type RoomReaction, type RoomStance,
} from "@/lib/gate/room";
import type { Evaluator } from "@/lib/gate/roster";

const CONCURRENCY = 4;

const STANCE_COLOR: Record<RoomStance, string> = {
  champion: "#2f7a3a", supportive: "#7fae3f", neutral: "#767c85", skeptical: "#db7f22", opposed: "#b23b3b",
};

async function pool<T, R>(items: T[], worker: (t: T) => Promise<R>, concurrency: number, onDone?: () => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= items.length) return;
    out[idx] = await worker(items[idx]);
    onDone?.();
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return out;
}

function monogram(name: string): string {
  const w = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "?") + (w[1]?.[0] || "")).toUpperCase();
}

function ReactionCard({ r }: { r: RoomReaction }) {
  return (
    <details className="crcard">
      <summary>
        <span className="crcard-id">{r.evaluatorId}</span>
        <span className="crcard-name">{r.name}</span>
        <span className="crcard-right">
          {r.veto && <span className="crcard-veto">VETO</span>}
          <span className="crcard-stance" style={{ background: STANCE_COLOR[r.stance] }}>{STANCE_LABEL[r.stance]}</span>
          <span className="crcard-score">{r.score.toFixed(1)}</span>
        </span>
      </summary>
      <div className="crcard-body">
        <p className="crcard-quote">“{r.quote}”</p>
        <p className="crcard-scope">{r.scopeNote}</p>
        <dl className="crcard-dl">
          {r.strength && <><dt>Strength</dt><dd>{r.strength}</dd></>}
          {r.concern && <><dt>Concern</dt><dd>{r.concern}</dd></>}
          {r.question && <><dt>Would ask</dt><dd>{r.question}</dd></>}
          {r.recordable && <><dt>Scoresheet</dt><dd>{r.recordable}</dd></>}
        </dl>
        {r.error && <p className="note">Simulated fallback — the live read failed ({r.error}).</p>}
      </div>
    </details>
  );
}

export default function CommitteeRoom({ proposal, rfp, ctx, gate }: {
  proposal: string;
  rfp: string;
  ctx: GateContext;
  gate: GateRun | null;
}) {
  const lenses = lensOptions();
  const states = buyerStateOptions();
  const [lensId, setLensId] = useState("B23");
  const [stateId, setStateId] = useState("C39");
  const [withMeta, setWithMeta] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [filled, setFilled] = useState<Record<string, RoomStance>>({});
  const [reactions, setReactions] = useState<RoomReaction[] | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const committee = committeeRoster();
  const meta = metaRoster();
  const panel: Evaluator[] = withMeta ? [...committee, ...meta] : committee;
  const lens = lenses.find((l) => l.id === lensId);
  const buyerState = states.find((s) => s.id === stateId);
  void ctx; // reserved: context registry threads into prompts in a later pass

  function runDemo() {
    if (!proposal.trim()) { setError("Paste the proposal above first."); return; }
    setError(null);
    const doc = parseDoc(proposal);
    setReactions(panel.map((ev) => demoReaction(ev, doc, gate)));
    setIsDemo(true);
  }

  async function runLive() {
    if (!proposal.trim()) { setError("Paste the proposal above first."); return; }
    setError(null);
    setRunning(true);
    setDone(0);
    setFilled({});
    setReactions(null);
    const doc = parseDoc(proposal);
    const briefing = gateBriefing(gate);
    const rfpExcerpt = rfp.trim().slice(0, 3500);
    let firstErr = "";
    let realCount = 0;
    const rs = await pool<Evaluator, RoomReaction>(
      panel,
      async (ev) => {
        const { text, note } = visibleText(ev.id, doc);
        let result: RoomReaction;
        try {
          const resp = await fetch("/api/gate-room", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              evaluator: { id: ev.id, name: ev.name, brief: ev.brief, emits: ev.emits, family: ev.family },
              lens: lens ? { name: lens.name, brief: lens.brief } : undefined,
              buyerState: buyerState ? { name: buyerState.name, brief: buyerState.brief, emits: buyerState.emits } : undefined,
              scopeNote: note,
              visibleText: ev.family === "G" ? doc.raw.slice(0, 14000) : text,
              rfpExcerpt,
              gateBriefing: briefing,
              canVeto: canVeto(ev.id),
            }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          realCount++;
          result = data as RoomReaction;
        } catch (e) {
          if (!firstErr) firstErr = e instanceof Error ? e.message : "the room service failed";
          result = { ...demoReaction(ev, doc, gate), error: firstErr };
        }
        setFilled((prev) => ({ ...prev, [ev.id]: result.stance }));
        return result;
      },
      CONCURRENCY,
      () => setDone((d) => d + 1),
    );
    setRunning(false);
    setReactions(rs);
    setIsDemo(realCount === 0);
    if (realCount === 0) {
      setError(`The committee couldn't convene live — ${firstErr}. A live run needs ANTHROPIC_API_KEY on the server. The reads below are simulated.`);
    } else if (realCount < panel.length) {
      setError(`${panel.length - realCount} of ${panel.length} reads fell back to a simulation (${firstErr}). The rest are real.`);
    }
  }

  const summary = reactions ? summarizeRoom(reactions) : null;
  const committeeReactions = reactions?.filter((r) => r.family === "A") ?? [];
  const metaReactions = reactions?.filter((r) => r.family === "G") ?? [];

  return (
    <section className="card">
      <h2 className="step">4 · Convene the committee <span className="note" style={{ fontWeight: 400 }}>· the live simulation — {panel.length} persona-agents read it in character</span></h2>
      <p className="sub">
        The gate above is the instant mechanical pass. This is the focus group: each family-A committee
        persona reads <em>only what their role reads</em> — the CFO gets the cost section, the reluctant
        conscript gets page one and the price — shaped by your sector lens and the committee&apos;s buying
        state{withMeta ? ", then the family-G meta critics read the assembled document" : ""}. The gate&apos;s
        findings are handed to every persona as the mechanical pre-check.
      </p>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div>
          <label className="fld" htmlFor="cr-lens">Sector lens <span className="note" style={{ fontWeight: 400 }}>· family B — pick exactly one</span></label>
          <select id="cr-lens" value={lensId} onChange={(e) => setLensId(e.target.value)} disabled={running}>
            {lenses.map((l) => <option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="fld" htmlFor="cr-state">Committee buying state <span className="note" style={{ fontWeight: 400 }}>· family C — how they&apos;re disposed</span></label>
          <select id="cr-state" value={stateId} onChange={(e) => setStateId(e.target.value)} disabled={running}>
            {states.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
          </select>
        </div>
      </div>
      <label className="gate-cmp" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={withMeta} onChange={(e) => setWithMeta(e.target.checked)} disabled={running} />
        Include the family-G meta wave (Blind Red Team, steel-man, read-aloud test…) — {metaRoster().length} more agents
      </label>

      {running && (
        <div className="convening" style={{ marginTop: 14 }}>
          <div className="conv-h"><span className="conv-pulse" /> The committee is convening — <b>{done}</b> of {panel.length} have read it</div>
          <div className="conv-grid">
            {panel.map((ev) => {
              const s = filled[ev.id];
              return (
                <span key={ev.id} className={`conv-dot ${s ? "in" : "wait"}`} style={s ? { background: STANCE_COLOR[s], borderColor: STANCE_COLOR[s] } : undefined} title={s ? `${ev.name} — ${STANCE_LABEL[s]}` : `${ev.name} — reading…`}>
                  {monogram(ev.name)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="runbar" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={runLive} disabled={running || !proposal.trim()}>
          {running ? `Convening… ${done}/${panel.length}` : "Convene the committee"}
        </button>
        <button className="btn ghost" onClick={runDemo} disabled={running}>Load demo reads</button>
        {running && <div className="progress"><div style={{ width: `${(done / panel.length) * 100}%` }} /></div>}
        <span className="note">{running ? `${done}/${panel.length} reading…` : `${panel.length} model calls · ~1–2 min live · demo is instant & free`}</span>
      </div>
      {error && <p className="error">{error}</p>}

      {summary && reactions && (
        <div className="crresults" style={{ marginTop: 18 }}>
          <div className="crhero">
            <div className="crhero-top">
              <span className={`crverdict v-${summary.verdict}`}>{ROOM_VERDICT_LABEL[summary.verdict]}</span>
              <span className="crscore">{summary.avgScore.toFixed(1)}<span>/5 committee avg</span></span>
              {isDemo && <span className="crdemo">simulated</span>}
            </div>
            <p className="crhead">{summary.headline}</p>
            <div className="crstack" role="img" aria-label="Committee stances">
              {STANCES.map((s) => {
                const c = summary.stanceDist.find((d) => d.key === s)!.count;
                if (!c) return null;
                return <span key={s} style={{ width: `${(c / summary.n) * 100}%`, background: STANCE_COLOR[s] }} title={`${STANCE_LABEL[s]}: ${c}`} />;
              })}
            </div>
            <div className="crlegend">
              {STANCES.map((s) => {
                const c = summary.stanceDist.find((d) => d.key === s)!.count;
                return c ? <span key={s}><i style={{ background: STANCE_COLOR[s] }} />{STANCE_LABEL[s]} {c}</span> : null;
              })}
            </div>
          </div>

          {summary.vetoes.length > 0 && (
            <div className="crveto">
              <b>Vetoes on the table:</b> {summary.vetoes.map((v) => `${v.name.split("/")[0].trim()} — “${v.concern || v.quote}”`).join(" · ")}
            </div>
          )}

          {summary.questions.length > 0 && (
            <div className="crqs">
              <h3>What you&apos;ll be asked in the room</h3>
              <ol>{summary.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
            </div>
          )}

          <h3 className="crgroup">The committee · {committeeReactions.length}</h3>
          <div className="crlist">{committeeReactions.map((r) => <ReactionCard key={r.evaluatorId} r={r} />)}</div>
          {metaReactions.length > 0 && (
            <>
              <h3 className="crgroup">The meta wave · {metaReactions.length} <span className="note" style={{ fontWeight: 400 }}>· the assembled document as an object</span></h3>
              <div className="crlist">{metaReactions.map((r) => <ReactionCard key={r.evaluatorId} r={r} />)}</div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
