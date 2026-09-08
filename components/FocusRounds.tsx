"use client";

import { useMemo, useState } from "react";
import FocusReport from "./FocusReport";
import { summarizeFocus, focusDemo, type FocusReaction, type FocusKind, type FocusSubject } from "@/lib/focus";
import { clamp } from "@/lib/util";

interface Persona { id: string; name: string; segment: string; how: string; base: number }
interface Round { title: string; body: string; reactions: FocusReaction[] }

export interface FocusRoundsData {
  round0: Round;
  subject: FocusSubject;
  panel: Persona[];
  kind: FocusKind;
  industry: string;
  url: string;
  isDemo: boolean;
  goal?: string;
  format?: string;
}

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

export default function FocusRounds({ round0, subject, panel, kind, industry, url, isDemo, goal, format }: FocusRoundsData) {
  const [rounds, setRounds] = useState<Round[]>([round0]);
  const [viewIdx, setViewIdx] = useState(0);
  const [refining, setRefining] = useState(false);
  const [done, setDone] = useState(0);
  const [note, setNote] = useState("");

  const summaries = useMemo(() => rounds.map((r) => summarizeFocus(r.reactions, kind)), [rounds, kind]);
  const view = rounds[viewIdx];
  const isWalk = round0.reactions.some((r) => r.journey && r.journey.length > 1);

  async function refine() {
    if (refining || isWalk) return;
    setRefining(true);
    setNote("");
    setDone(0);
    const cur = rounds[rounds.length - 1];
    const curSum = summaries[summaries.length - 1];
    const concerns = curSum.themes.concerns.map((t) => t.text);
    const suggestions = curSum.themes.suggestions.map((t) => t.text);

    let draft = { title: cur.title, body: cur.body };
    let source = "heuristic";
    try {
      const resp = await fetch("/api/focus-refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, format, goal, context: subject.context, focusAreas: subject.focusAreas, subject: { title: cur.title, body: cur.body }, concerns, suggestions }),
      });
      const data = await resp.json();
      if (resp.ok && data.draft) { draft = data.draft; source = data.source; }
    } catch {
      /* fall through to keeping the current copy */
    }

    const newSubject: FocusSubject = { ...subject, title: draft.title, body: draft.body };
    const roundIdx = rounds.length; // 1 on the first refine
    let reactions: FocusReaction[];
    if (isDemo) {
      reactions = panel.map((p) => focusDemo({ ...p, base: clamp((p.base ?? 0.55) + 0.07 * roundIdx, 0, 0.95) }, newSubject));
    } else {
      reactions = await pool<Persona, FocusReaction>(
        panel,
        async (p) => {
          try {
            const resp = await fetch("/api/focus", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ persona: { id: p.id, name: p.name, segment: p.segment, how: p.how }, subject: newSubject }),
            });
            const d = await resp.json();
            if (!resp.ok) throw new Error(d.error || "run failed");
            return d as FocusReaction;
          } catch {
            return focusDemo({ ...p, base: clamp((p.base ?? 0.55) + 0.07 * roundIdx, 0, 0.95) }, newSubject);
          }
        },
        4,
        () => setDone((x) => x + 1),
      );
    }

    setRounds((r) => [...r, { title: draft.title, body: draft.body, reactions }]);
    setViewIdx(rounds.length);
    setRefining(false);
    if (source !== "model" && !isDemo) setNote("Drafted the challenger without a model key (heuristic) — set ANTHROPIC_API_KEY for a real rewrite.");
  }

  return (
    <>
      {!isWalk && (
        <section className="card rounds">
          <div className="rounds-head">
            <div>
              <div className="rounds-title">Refine &amp; re-test</div>
              <div className="rounds-sub">Draft a stronger version from the room&apos;s feedback and run it against the same panel. Keep going until the score is where you want it — every round is kept.</div>
            </div>
          </div>
          <div className="rounds-track">
            {rounds.map((r, i) => {
              const s = summaries[i];
              const prev = i > 0 ? summaries[i - 1] : null;
              const delta = prev ? s.positivePct - prev.positivePct : 0;
              return (
                <div className="round-wrap" key={i}>
                  {i > 0 && <span className="round-arrow">→</span>}
                  <button className={`round ${i === viewIdx ? "on" : ""}`} onClick={() => setViewIdx(i)}>
                    <div className="round-k">{i === 0 ? "Original" : `Refine ${i}`}</div>
                    <div className="round-score">{s.positivePct}%<span> positive</span></div>
                    <div className="round-sub2">{s.avgSentiment.toFixed(1)}/5 · {s.tooClose ? "too close" : s.verdict}</div>
                    {prev && <div className={`round-delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts</div>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="rounds-actions">
            <button className="btn primary" onClick={refine} disabled={refining}>
              {refining ? (isDemo ? "Refining…" : `Re-running… ${done}/${panel.length}`) : rounds.length > 1 ? "Refine again →" : "Refine from this feedback →"}
            </button>
            {rounds.length > 1 && <span className="note">Happy with the score? Stop here — the original and every round stay above.</span>}
          </div>
          {note && <p className="note" style={{ marginTop: 8 }}>{note}</p>}
          <details className="copytested">
            <summary>The copy tested · {viewIdx === 0 ? "Original" : `Refine ${viewIdx}`}</summary>
            <div className="ct-body-wrap">
              {view.title && <div className="ct-title">{view.title}</div>}
              <pre className="ct-body">{view.body}</pre>
            </div>
          </details>
        </section>
      )}

      <FocusReport reactions={view.reactions} kind={kind} industry={industry} url={url} isDemo={isDemo} goal={goal} format={format} context={subject.context} focusAreas={subject.focusAreas} />
    </>
  );
}
