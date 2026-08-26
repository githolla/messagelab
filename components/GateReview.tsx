"use client";

// The gate review workspace: findings as a prioritized fix queue on the left,
// the proposal itself on the right with every located finding highlighted in
// place. Click a finding → the document scrolls to the offending passage;
// click a highlight → the finding lights up. Built for the person who wrote
// the proposal and needs to refine it, not for an auditor.

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { GateFinding, GateRun } from "@/lib/gate/model";
import { parseDoc } from "@/lib/gate/parse";
import { locateFindings, exampleMarkKey, findingHasMarks, type DocMark } from "@/lib/gate/highlight";

const VERDICT_LABEL: Record<GateFinding["verdict"], string> = {
  deficiency: "Deficiency", weakness: "Weakness", pass: "Pass", skipped: "Skipped",
};

interface Anchor { offset: number; title: string }

export default function GateReview({ title, run, docText }: { title: string; run: GateRun; docText: string }) {
  const uid = useMemo(() => title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), [title]);
  const docRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const marks = useMemo(() => locateFindings(docText, run.findings), [docText, run]);
  const anchors = useMemo<Anchor[]>(() => {
    const doc = parseDoc(docText);
    const out: Anchor[] = [];
    for (const s of doc.sections) {
      const idx = docText.indexOf(s.title);
      if (idx >= 0) out.push({ offset: idx, title: s.title });
    }
    return out.sort((a, b) => a.offset - b.offset);
  }, [docText]);

  const issues = run.findings.filter((f) => f.verdict === "deficiency" || f.verdict === "weakness");
  const passes = run.findings.filter((f) => f.verdict === "pass");
  const skipped = run.findings.filter((f) => f.verdict === "skipped");
  const blocking = issues.filter((f) => f.blocking);
  const shippable = run.tally.blocking === 0;

  function scrollDocTo(selector: string) {
    docRef.current?.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function jumpToFinding(f: GateFinding) {
    setActiveId((cur) => (cur === f.id ? null : f.id));
    setActiveKey(null);
    const first = marks.find((m) => m.findingId === f.id);
    if (first) scrollDocTo(`[data-mk="${CSS.escape(first.key)}"]`);
  }
  function jumpToExample(f: GateFinding, i: number) {
    setActiveId(f.id);
    const key = exampleMarkKey(marks, f.id, i);
    if (key) {
      setActiveKey(key);
      scrollDocTo(`[data-mk="${CSS.escape(key)}"]`);
      return;
    }
    const sec = f.examples[i]?.section;
    if (sec && anchors.some((a) => a.title === sec)) {
      scrollDocTo(`[data-sec="${CSS.escape(sec)}"]`);
    }
  }
  function onMarkClick(findingId: string, key: string) {
    setActiveId(findingId);
    setActiveKey(key);
    document.getElementById(`gf-${uid}-${findingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Render the document once as text + <mark> + section anchors.
  const docNodes = useMemo<ReactNode[]>(() => {
    type Ev = { start: number; end: number } & ({ type: "mark"; m: DocMark } | { type: "anchor"; title: string });
    const events: Ev[] = [
      ...marks.map((m) => ({ type: "mark" as const, start: m.start, end: m.end, m })),
      ...anchors.map((a) => ({ type: "anchor" as const, start: a.offset, end: a.offset, title: a.title })),
    ].sort((a, b) => a.start - b.start || (a.type === "anchor" ? -1 : 1));
    const nodes: ReactNode[] = [];
    let pos = 0;
    for (const ev of events) {
      if (ev.start < pos) continue;
      if (ev.start > pos) nodes.push(docText.slice(pos, ev.start));
      pos = ev.start;
      if (ev.type === "anchor") {
        nodes.push(<span key={`a-${ev.start}`} data-sec={ev.title} />);
      } else {
        nodes.push(
          <mark
            key={ev.m.key}
            data-mk={ev.m.key}
            data-fid={ev.m.findingId}
            className={`gmk ${ev.m.verdict}${activeId === ev.m.findingId ? " on" : ""}${activeKey === ev.m.key ? " hit" : ""}`}
            onClick={() => onMarkClick(ev.m.findingId, ev.m.key)}
            title={`${ev.m.findingId} — click to see the finding`}
          >
            {docText.slice(ev.start, ev.end)}
          </mark>,
        );
        pos = ev.end;
      }
    }
    nodes.push(docText.slice(pos));
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docText, marks, anchors, activeId, activeKey]);

  const words = (docText.match(/\S+/g) || []).length;
  const activeHasMarks = activeId ? findingHasMarks(marks, activeId) : false;

  return (
    <section className="card">
      <div className="gscore-head">
        <h2 className="step" style={{ margin: 0 }}>{title}</h2>
        <span className={`gship ${shippable ? "ok" : "no"}`}>{shippable ? "Nothing blocking — clear to ship" : "DO NOT SHIP"}</span>
      </div>

      {/* The fix queue in one sentence */}
      {blocking.length > 0 ? (
        <div className="gfix">
          <b>Fix these {blocking.length} first</b> — they block shipping, and no amount of better writing routes around them:
          <div className="gfix-chips">
            {blocking.map((f) => (
              <button key={f.id} className="gfix-chip" onClick={() => jumpToFinding(f)}>
                {f.id} · {f.count} {f.name.replace(/ (detector|checker|verifier|validator|scorer|finder|auditor)$/i, "").toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      ) : issues.length > 0 ? (
        <p className="gfix soft">Nothing blocks shipping. The {issues.length} weakness{issues.length === 1 ? "" : "es"} below are where the draft loses points it doesn&apos;t have to.</p>
      ) : (
        <p className="gfix soft">Clean run — every executed check passed.</p>
      )}

      <div className="greview" style={{ marginTop: 14 }}>
        {/* Left: the findings */}
        <div className="grv-left">
          <div className="gtally" style={{ marginTop: 0 }}>
            <div className="gt"><b>{run.tally.deficiencies}</b><span>deficiencies</span></div>
            <div className="gt"><b>{run.tally.weaknesses}</b><span>weaknesses</span></div>
            <div className={`gt ${run.tally.blocking ? "bad" : "good"}`}><b>{run.tally.blocking}</b><span>blocking</span></div>
          </div>

          {issues.map((f) => {
            const located = findingHasMarks(marks, f.id);
            const open = activeId === f.id;
            return (
              <div key={f.id} id={`gf-${uid}-${f.id}`} className={`gfind ${f.verdict}${open ? " active" : ""}`}>
                <button className="gfind-head asbtn" onClick={() => jumpToFinding(f)}>
                  <span className="gfind-id">{f.id}</span>
                  <span className={`gfind-verdict ${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span>
                  {f.blocking && <span className="gfind-block">BLOCKING</span>}
                  <span className="gfind-sum">{f.summary}</span>
                  {located && <span className="gfind-jump" aria-hidden>↦</span>}
                </button>
                <ul className="gfind-ex">
                  {(open ? f.examples : f.examples.slice(0, 3)).map((e, i) => {
                    const jumpable = exampleMarkKey(marks, f.id, i) !== null || anchors.some((a) => a.title === e.section);
                    return (
                      <li key={i}>
                        {jumpable ? (
                          <button className="gex-btn" onClick={() => jumpToExample(f, i)}>
                            <span className="gfind-sec">[{e.section}]</span> {e.quote}
                          </button>
                        ) : (
                          <span className="gex-static"><span className="gfind-sec">[{e.section}]</span> {e.quote}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {f.examples.length > 3 && !open && (
                  <button className="gfind-more" onClick={() => { setActiveId(f.id); }}>Show all {f.examples.length}</button>
                )}
              </div>
            );
          })}

          <details className="gquiet">
            <summary>✓ {passes.length} checks passed</summary>
            <ul>{passes.map((f) => <li key={f.id}><span className="gfind-id">{f.id}</span> {f.summary}</li>)}</ul>
          </details>
          {skipped.length > 0 && (
            <details className="gquiet">
              <summary>— {skipped.length} skipped (missing context or artifact)</summary>
              <ul>{skipped.map((f) => <li key={f.id}><span className="gfind-id">{f.id}</span> {f.summary}</li>)}</ul>
            </details>
          )}
        </div>

        {/* Right: the proposal, highlighted */}
        <div className="grv-right">
          <div className="gdoc-bar">
            <span className="gdoc-t">The proposal · {words.toLocaleString()} words</span>
            <span className="gdoc-legend">
              <i className="lg-def" /> deficiency&nbsp;&nbsp;<i className="lg-weak" /> weakness
              {activeHasMarks && <button className="gdoc-clear" onClick={() => { setActiveId(null); setActiveKey(null); }}>clear filter</button>}
            </span>
          </div>
          <div ref={docRef} className={`gdoc${activeHasMarks ? " hasActive" : ""}`}>{docNodes}</div>
        </div>
      </div>
    </section>
  );
}
