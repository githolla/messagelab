"use client";

import { useMemo, useState } from "react";
import { INDUSTRIES } from "@/lib/industries";
import { monogram } from "@/lib/archetypes";
import {
  kindDef,
  summarizeFocus,
  selectReel,
  SENTIMENTS,
  SENTIMENT_LABEL,
  SENTIMENT_SCORE,
  FOCUS_VERDICT_LABEL,
  type FocusKind,
  type FocusReaction,
  type Sentiment,
  type WalkStep,
} from "@/lib/focus";

const DISPLAY_MAX = 60;

const SENT_COLOR: Record<Sentiment, string> = {
  love: "#2f7a3a", like: "#7fae3f", neutral: "#767c85", skeptical: "#db7f22", reject: "#b23b3b",
};
const sentBand = (v: number) => (v >= 4 ? "hi" : v >= 3 ? "mid" : "lo");

function pathHops(journey: WalkStep[]): string[] {
  const hops: string[] = [];
  for (const s of journey) {
    if (s.action === "start") hops.push(s.target || "Home");
    else if (s.action === "click" && s.target) hops.push(s.target);
    else if (s.action === "back") hops.push("↩ back");
  }
  return hops.slice(0, 6);
}

export interface FocusReportData {
  reactions: FocusReaction[];
  kind: FocusKind;
  industry: string;
  url: string;
  isDemo: boolean;
  goal?: string;
  format?: string;
}

type StatFilter = "" | "positive" | "negative" | "act";
const STAT_LABEL: Record<Exclude<StatFilter, "">, string> = {
  positive: "positive (love / like)", negative: "negative (skeptical / reject)", act: "would take action (4–5/5)",
};

export default function FocusReport({ reactions, kind, industry, url, isDemo, goal, format }: FocusReportData) {
  const [openR, setOpenR] = useState<FocusReaction | null>(null);
  const [segFilter, setSegFilter] = useState<string>("all");
  const [statFilter, setStatFilter] = useState<StatFilter>("");
  const [copied, setCopied] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");

  const def = kindDef(kind);
  const industryLabel = INDUSTRIES.find((i) => i.key === industry)?.label ?? "general";
  const summary = useMemo(() => summarizeFocus(reactions, kind), [reactions, kind]);
  const isWalkReport = useMemo(() => reactions.some((r) => r.journey && r.journey.length > 1), [reactions]);
  const reel = useMemo(() => selectReel(reactions, 5), [reactions]);

  const filtered = useMemo(() => {
    let rs = reactions;
    if (statFilter === "positive") rs = rs.filter((r) => r.sentiment === "love" || r.sentiment === "like");
    else if (statFilter === "negative") rs = rs.filter((r) => r.sentiment === "skeptical" || r.sentiment === "reject");
    else if (statFilter === "act") rs = rs.filter((r) => r.likelihood >= 4);
    if (segFilter !== "all") rs = rs.filter((r) => r.segment === segFilter);
    return rs;
  }, [reactions, segFilter, statFilter]);

  // "Every number is a receipt" — click a stat to see the agents behind it.
  function openStat(key: StatFilter) {
    setStatFilter(key);
    setSegFilter("all");
    setTimeout(() => {
      const el = document.getElementById("sec-room");
      if (el) { (el as HTMLDetailsElement).open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }, 30);
  }
  // Panel mean + most-dissenting segment, for the By-segment callout.
  const panelMean = summary.avgSentiment;
  const dissent = useMemo(() => {
    if (summary.bySegment.length < 2) return null;
    let top = summary.bySegment[0];
    for (const s of summary.bySegment) if (Math.abs(s.avgSentiment - panelMean) > Math.abs(top.avgSentiment - panelMean)) top = s;
    const gap = top.avgSentiment - panelMean;
    return Math.abs(gap) >= 0.8 ? { seg: top, gap } : null;
  }, [summary, panelMean]);
  const thinCut = summary.n / (summary.bySegment.length || 1) / 2;

  const segmentDetail = useMemo(
    () =>
      summary.bySegment.map((s) => {
        const rs = reactions.filter((r) => r.segment === s.segment);
        return {
          ...s,
          dist: SENTIMENTS.map((k) => ({ key: k, count: rs.filter((r) => r.sentiment === k).length })),
          reactions: rs,
        };
      }),
    [summary, reactions],
  );

  const themeCat: Record<string, keyof Pick<FocusReaction, "resonates" | "concern" | "question" | "suggestion">> = {
    resonates: "resonates", concerns: "concern", questions: "question", suggestions: "suggestion",
  };
  function reactionsForTheme(catKey: string, text: string): FocusReaction[] {
    const field = themeCat[catKey];
    const key = text.trim().toLowerCase();
    return reactions.filter((r) => (r[field] || "").trim().toLowerCase() === key);
  }

  const walkStats = useMemo(() => {
    if (!isWalkReport) return null;
    const withJ = reactions.filter((r) => r.journey && r.journey.length > 1);
    if (!withJ.length) return null;
    const stepCounts = withJ.map((r) => r.journey!.filter((s) => s.action === "click").length);
    const avgSteps = stepCounts.reduce((a, b) => a + b, 0) / withJ.length;
    const pageMap = new Map<string, number>();
    for (const r of withJ)
      for (const s of r.journey!)
        if ((s.action === "start" || s.action === "click") && s.target) {
          const key = s.target.trim();
          if (key) pageMap.set(key, (pageMap.get(key) || 0) + 1);
        }
    const pages = [...pageMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const wouldAct = withJ.filter((r) => r.likelihood >= 4).length;
    const wavered = withJ.filter((r) => r.likelihood === 3).length;
    const left = withJ.length - wouldAct - wavered;
    // Biggest-leak hop: where agents who didn't convert last were before giving up.
    const leakMap = new Map<string, number>();
    for (const r of withJ.filter((x) => x.likelihood <= 3)) {
      const hops = r.journey!.filter((s) => (s.action === "start" || s.action === "click") && s.target);
      const last = hops[hops.length - 1]?.target?.trim();
      if (last) leakMap.set(last, (leakMap.get(last) || 0) + 1);
    }
    const leakTop = [...leakMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const leak = leakTop && leakTop[1] >= 2 ? { label: leakTop[0], count: leakTop[1] } : null;
    return { n: withJ.length, avgSteps, pages, maxPage: Math.max(1, ...pages.map((p) => p.count)), wouldAct, wavered, left, leak, real: withJ.filter((r) => !r.error).length };
  }, [reactions, isWalkReport]);

  // "What to fix first" — rank concern clusters by reach × intensity.
  const actionItems = useMemo(() => {
    return summary.themes.concerns
      .map((t) => {
        const who = reactionsForTheme("concerns", t.text);
        const intensity = who.length ? who.reduce((s, r) => s + (6 - SENTIMENT_SCORE[r.sentiment]), 0) / who.length : 0;
        const rep = who.find((r) => (r.suggestion || "").trim()) || who[0];
        return { text: t.text, count: t.count, intensity, score: t.count * intensity, fix: rep?.suggestion || "", rep };
      })
      .filter((a) => a.count > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [summary, reactions]);

  function copyBrief() {
    const L: string[] = [];
    L.push(`# Focus group brief${goal?.trim() ? `: ${goal.trim()}` : ""}`);
    L.push("");
    L.push(`**Panel:** ${summary.n} persona-agents · ${industryLabel} · ${def.label}${format ? ` · ${format}` : ""}${isDemo ? " · (demo data)" : ""}`);
    L.push(`**Verdict:** ${summary.tooClose ? "Too close to call" : FOCUS_VERDICT_LABEL[summary.verdict]} — ${summary.readline}`);
    L.push(`**Confidence:** positive ${summary.positivePct}% (95% CI ${Math.round(summary.positiveCI.low * 100)}–${Math.round(summary.positiveCI.high * 100)}%) · agreement ${Math.round(summary.agreement * 100)}% (${summary.agreementLabel}).`);
    if (goal?.trim()) L.push(`**Question tested:** ${goal.trim()}`);
    L.push("");
    L.push(`## What resonated`);
    summary.themes.resonates.slice(0, 4).forEach((t) => L.push(`- ${t.text}${t.count > 1 ? ` (${t.count})` : ""}`));
    L.push("");
    L.push(`## What to fix first`);
    actionItems.forEach((a, i) => L.push(`${i + 1}. ${a.text} — ${a.count} raised${a.fix ? `. Try: ${a.fix}` : ""}`));
    L.push("");
    L.push(`## By segment`);
    summary.bySegment.forEach((s) => L.push(`- ${s.segment} (n=${s.n}): ${s.avgSentiment.toFixed(1)}/5, ${s.positivePct}% positive`));
    L.push("");
    L.push(`_Simulated persona-agent responses — directional signal, model-dependent and hypothesis-generating, not a market prediction. Graduate high-stakes calls to the MatrAIx research harness or real people._`);
    const md = L.join("\n");
    navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }

  function segStats(name: string) {
    const s = segmentDetail.find((x) => x.segment === name) || segmentDetail[0];
    if (!s) return null;
    const avgLike = s.reactions.reduce((t, r) => t + r.likelihood, 0) / (s.reactions.length || 1);
    return { ...s, avgLike };
  }
  const A = segStats(cmpA || segmentDetail[0]?.segment || "");
  const B = segStats(cmpB || segmentDetail[segmentDetail.length - 1]?.segment || "");
  const compareLine = (() => {
    if (!A || !B || A.segment === B.segment) return "";
    const warm = A.avgSentiment >= B.avgSentiment ? A : B;
    const cool = warm === A ? B : A;
    const gap = Math.abs(A.positivePct - B.positivePct);
    return `${warm.segment} are the warmer room — ${warm.positivePct}% positive vs ${cool.positivePct}% for ${cool.segment} (${gap}-pt gap), and ${Math.abs(A.avgLike - B.avgLike).toFixed(1)}/5 apart on likelihood to ${def.verb}.`;
  })();

  return (
    <div className="report">
      {/* Cover */}
      <section className="report-cover card">
        <div className="rc-top">
          <span className="rc-eyebrow">Focus group report</span>
          <div className="rc-actions">
            {isDemo && <span className="demotag">Demo</span>}
            <button className="btn ghost rc-print" onClick={copyBrief}>{copied ? "Copied ✓" : "Copy brief"}</button>
            <button className="btn ghost rc-print" onClick={() => window.print()}>Print / PDF</button>
          </div>
        </div>
        <div className={`rc-verdict ${summary.tooClose ? "mixed" : summary.verdict}`}>
          <span className={`fg-badge ${summary.tooClose ? "mixed" : summary.verdict}`}>{summary.tooClose ? "Too close to call" : FOCUS_VERDICT_LABEL[summary.verdict]}</span>
          <p className="rc-headline">{summary.readline}</p>
        </div>
        {goal && goal.trim() && (
          <div className="rc-qa">
            <div><span className="rc-qa-k">The question we tested</span><p>{goal.trim()}</p></div>
            <div><span className="rc-qa-k">What the room said</span><p>{summary.headline}</p></div>
          </div>
        )}
        <p className="rc-meta">
          <b>{summary.n.toLocaleString()} persona-agents</b> · {industryLabel} · {def.label}{format ? ` · ${format}` : ""}
          {isWalkReport && url.trim() ? <> · walkthrough of <span className="rc-url">{url.trim()}</span></> : null}
        </p>
        <ProvenanceChip n={summary.n} isDemo={isDemo} />
        <div className="fg-stats">
          <button className="fg-stat clickable" onClick={() => openStat("positive")} title="See the positive agents">
            <div className="fg-stat-n">{summary.positivePct}%</div>
            <div className="fg-stat-l">Positive <span className="ci">±{Math.round(((summary.positiveCI.high - summary.positiveCI.low) / 2) * 100)}</span></div>
            <div className="fg-stat-see">see the {summary.sentimentDist.filter((s) => s.key === "love" || s.key === "like").reduce((t, s) => t + s.count, 0)} →</div>
          </button>
          <div className="fg-stat"><div className={`fg-stat-n ${sentBand(summary.avgSentiment)}`}>{summary.avgSentiment.toFixed(1)}<span>/5</span></div><div className="fg-stat-l">Avg sentiment</div></div>
          <button className="fg-stat clickable" onClick={() => openStat("act")} title="See who'd act">
            <div className={`fg-stat-n ${sentBand(summary.avgLikelihood)}`}>{summary.avgLikelihood.toFixed(1)}<span>/5</span></div>
            <div className="fg-stat-l">{def.actionLabel}</div>
            <div className="fg-stat-see">see the {reactions.filter((r) => r.likelihood >= 4).length} →</div>
          </button>
          <div className="fg-stat"><div className="fg-stat-n">{summary.n}</div><div className="fg-stat-l">In the room</div></div>
        </div>
        {reel.length > 0 && (
          <div className="reel">
            <div className="reel-hero" onClick={() => setOpenR(reel[0])} role="button" tabIndex={0}>
              <span className="reel-mark" style={{ background: SENT_COLOR[reel[0].sentiment] }} />
              <blockquote>&ldquo;{reel[0].quote}&rdquo;</blockquote>
              <cite>{reel[0].personaName} · {reel[0].segment} · {SENTIMENT_LABEL[reel[0].sentiment]}</cite>
            </div>
            {reel.length > 1 && (
              <div className="reel-grid">
                {reel.slice(1).map((r) => (
                  <button className="reel-chip" key={r.personaId} onClick={() => setOpenR(r)} style={{ borderLeftColor: SENT_COLOR[r.sentiment] }}>
                    &ldquo;{r.quote}&rdquo;<span>{r.personaName} · {r.segment}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <nav className="rc-jump">
          <a href="#sec-sentiment">Sentiment</a>
          {isWalkReport && <a href="#sec-walk">The walkthrough</a>}
          <a href="#sec-themes">What they said</a>
          {segmentDetail.length > 1 && <a href="#sec-segments">By segment</a>}
          <a href="#sec-room">The room</a>
        </nav>
      </section>

      {/* Room agreement — consensus vs division */}
      <section className="card agreecard">
        <div className="agree-left">
          <div className="agree-h">Room agreement</div>
          <div className={`agree-meter ${summary.agreement >= 0.5 ? "hi" : summary.agreement >= 0.3 ? "mid" : "lo"}`}>
            <span style={{ width: `${Math.round(summary.agreement * 100)}%` }} />
          </div>
          <div className="agree-label"><b>{summary.agreementLabel}</b> · {Math.round(summary.agreement * 100)}% aligned</div>
        </div>
        <div className="agree-right">
          <div className="agree-point">
            <span className="ap-k good">Where they agree</span>
            <p>{summary.themes.resonates[0]?.text || "No single point of consensus stood out."}</p>
          </div>
          <div className="agree-point">
            <span className="ap-k bad">The fault line</span>
            <p>{dissent ? `${dissent.seg.segment} pull against the room.` : summary.themes.concerns[0]?.text || "No sharp division — objections are scattered."}</p>
          </div>
        </div>
      </section>

      {/* Sentiment & likelihood */}
      <details className="rsec card" id="sec-sentiment" open>
        <summary className="rsec-sum"><span className="rsec-t">Sentiment &amp; likelihood</span><span className="rsec-hint">{(() => {
          const rej = summary.sentimentDist.filter((s) => s.key === "reject").reduce((t, s) => t + s.count, 0);
          const dir = summary.positivePct >= summary.negativePct ? "leans positive" : "leans negative";
          return rej > 0 ? `${dir} — but ${rej} would reject it outright` : dir;
        })()}</span></summary>
        <div className="rsec-body">
          <div className="fg-charts">
            <div>
              <div className="sb-h">Sentiment across the room</div>
              <div className="prefbar">
                {summary.sentimentDist.map((s) => {
                  const pct = (s.count / summary.n) * 100;
                  return s.count > 0 ? (
                    <span key={s.key} className="pf" style={{ width: `${pct}%`, background: SENT_COLOR[s.key] }} title={`${SENTIMENT_LABEL[s.key]}: ${s.count} of ${summary.n} (${Math.round(pct)}%)`}>
                      {pct >= 10 ? <span className="pflabel">{Math.round(pct)}%</span> : null}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="prefkey">
                {summary.sentimentDist.map((s) => (
                  <span key={s.key} className={`pk ${s.count === 0 ? "muted" : ""}`}>
                    <i style={{ background: SENT_COLOR[s.key] }} />{SENTIMENT_LABEL[s.key]} <b>{s.count}</b>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="sb-h">{def.actionLabel} (1–5)</div>
              <div className="likedist">
                {summary.likelihoodDist.map((c, i) => {
                  const max = Math.max(1, ...summary.likelihoodDist);
                  return (
                    <div className="likerow" key={i}>
                      <span className="likelbl">{i + 1}</span>
                      <span className="likebar" title={`${c} rated ${i + 1}/5`}><span className={sentBand(i + 1)} style={{ width: `${Math.max(2, (c / max) * 100)}%` }} /></span>
                      <span className="likenum">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* One dot per agent — the distribution as clickable provenance */}
          <div className="swarm">
            <div className="sb-h">Every agent · click any to open</div>
            <div className="swarm-grid">
              {[...reactions]
                .sort((a, b) => SENTIMENT_SCORE[b.sentiment] - SENTIMENT_SCORE[a.sentiment])
                .slice(0, DISPLAY_MAX)
                .map((r) => (
                  <button key={r.personaId} className="swarm-dot" style={{ background: SENT_COLOR[r.sentiment] }} title={`${r.personaName} · ${SENTIMENT_LABEL[r.sentiment]} · ${r.likelihood}/5`} onClick={() => setOpenR(r)} />
                ))}
              {reactions.length > DISPLAY_MAX && <span className="swarm-more">+{reactions.length - DISPLAY_MAX} more</span>}
            </div>
          </div>
        </div>
      </details>

      {/* The walkthrough (website walk only) */}
      {isWalkReport && walkStats && (
        <details className="rsec card" id="sec-walk" open>
          <summary className="rsec-sum"><span className="rsec-t">The walkthrough</span><span className="rsec-hint">how they moved through the site</span></summary>
          <div className="rsec-body">
            <p className="sub">
              {walkStats.n} persona-agent{walkStats.n > 1 ? "s" : ""} navigated the site themselves
              {walkStats.real < walkStats.n ? ` (${walkStats.n - walkStats.real} simulated)` : ""} — on average{" "}
              <b>{walkStats.avgSteps.toFixed(1)} clicks</b> each before deciding.
            </p>
            <div className="walkgrid">
              <div>
                <div className="sb-h">Where they ended up</div>
                <div className="prefbar">
                  {([
                    { k: "wouldAct", label: `Would ${def.verb}`, v: walkStats.wouldAct, c: "#2f7a3a" },
                    { k: "wavered", label: "On the fence", v: walkStats.wavered, c: "#767c85" },
                    { k: "left", label: "Would drop off", v: walkStats.left, c: "#b23b3b" },
                  ] as const).map((o) =>
                    o.v > 0 ? (
                      <span key={o.k} className="pf" style={{ width: `${(o.v / walkStats.n) * 100}%`, background: o.c }} title={`${o.label}: ${o.v}`}>
                        {o.v / walkStats.n >= 0.12 ? <span className="pflabel">{o.v}</span> : null}
                      </span>
                    ) : null,
                  )}
                </div>
                <div className="prefkey">
                  <span className="pk"><i style={{ background: "#2f7a3a" }} />Would {def.verb} <b>{walkStats.wouldAct}</b></span>
                  <span className="pk"><i style={{ background: "#767c85" }} />On the fence <b>{walkStats.wavered}</b></span>
                  <span className="pk"><i style={{ background: "#b23b3b" }} />Would drop off <b>{walkStats.left}</b></span>
                </div>
              </div>
              <div>
                <div className="sb-h">Most-visited pages &amp; elements</div>
                <div className="pagebars">
                  {walkStats.pages.map((p) => {
                    const isLeak = walkStats.leak?.label === p.label;
                    return (
                      <div className={`pagerow ${isLeak ? "leak" : ""}`} key={p.label} title={`${p.label}: visited ${p.count}×${isLeak ? ` · ${walkStats.leak!.count} stalled here` : ""}`}>
                        <span className="pagelbl">{p.label}</span>
                        <span className="pagebar"><span style={{ width: `${(p.count / walkStats.maxPage) * 100}%` }} /></span>
                        <span className="pagenum">{p.count}</span>
                      </div>
                    );
                  })}
                </div>
                {walkStats.leak && (
                  <p className="leaknote">⚠ Biggest leak: <b>{walkStats.leak.count} of {walkStats.n}</b> stalled or gave up at <b>{walkStats.leak.label}</b>.</p>
                )}
              </div>
            </div>
            <p className="note" style={{ marginTop: 10 }}>Open any persona in the room below to replay their full click-by-click path.</p>
          </div>
        </details>
      )}

      {/* What the room said — themes drill down to the people who said them */}
      <details className="rsec card" id="sec-themes" open>
        <summary className="rsec-sum"><span className="rsec-t">What the room said</span><span className="rsec-hint">click a theme to see who raised it</span></summary>
        <div className="rsec-body">
          <div className="themegrid">
            {([
              { k: "resonates", label: "What resonates", cls: "good" },
              { k: "concerns", label: "Concerns", cls: "bad" },
              { k: "questions", label: "Questions they'd ask", cls: "" },
              { k: "suggestions", label: "Suggestions", cls: "" },
            ] as const).map((col) => (
              <div className="themecol" key={col.k}>
                <div className={`theme-h ${col.cls}`}>{col.label}</div>
                <div className="themelist">
                  {summary.themes[col.k].map((t, i) => {
                    const who = reactionsForTheme(col.k, t.text);
                    return (
                      <details className="tdrill" key={i}>
                        <summary>{t.count > 1 && <span className="theme-n">{t.count}×</span>}<span className="tdrill-txt">{t.text}</span></summary>
                        <div className="tdrill-body">
                          {who.map((r) => (
                            <button className="tquote" key={r.personaId} onClick={() => setOpenR(r)}>
                              <span className="ico sm" style={{ background: SENT_COLOR[r.sentiment] }}>{monogram(r.personaName)}</span>
                              <span className="tq-txt"><b>{r.personaName}</b> <em>{r.segment}</em><br />&ldquo;{r.quote}&rdquo;</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* By segment — stacked sentiment + drill into each segment's room */}
      {segmentDetail.length > 1 && (
        <details className="rsec card" id="sec-segments" open>
          <summary className="rsec-sum"><span className="rsec-t">By segment</span><span className="rsec-hint">{dissent ? "one segment breaks with the room" : "unusually unified"}</span></summary>
          <div className="rsec-body">
            {dissent ? (
              <div className="callout dissent">
                <b>{dissent.seg.segment} break{dissent.seg.segment.endsWith("s") ? "" : "s"} with the room</b> — {dissent.seg.positivePct}% positive vs {summary.positivePct}% across the panel ({dissent.gap > 0 ? "warmer" : "colder"} by {Math.abs(dissent.gap).toFixed(1)} pts). Worth a closer look before you decide.
              </div>
            ) : (
              <div className="callout calm">The room is <b>unusually unified</b> — every segment lands within about a point of the panel average.</div>
            )}
            <div className="cmp-toggle">
              <button className={`segchip ${compareOn ? "on" : ""}`} onClick={() => setCompareOn((v) => !v)}>{compareOn ? "Hide compare" : "Compare two segments"}</button>
            </div>
            {compareOn && A && B && (
              <div className="cmp">
                <div className="cmp-picks">
                  <select value={A.segment} onChange={(e) => setCmpA(e.target.value)}>
                    {segmentDetail.map((s) => <option key={s.segment} value={s.segment}>{s.segment}</option>)}
                  </select>
                  <span className="cmp-vs">vs</span>
                  <select value={B.segment} onChange={(e) => setCmpB(e.target.value)}>
                    {segmentDetail.map((s) => <option key={s.segment} value={s.segment}>{s.segment}</option>)}
                  </select>
                </div>
                {compareLine && <p className="cmp-line">{compareLine}</p>}
                <div className="cmp-cols">
                  {[A, B].map((s, i) => (
                    <div className="cmp-col" key={i}>
                      <div className="cmp-name">{s.segment} <span className="note">· n={s.n}</span></div>
                      <div className="sd-bar">
                        {s.dist.map((d) => (d.count > 0 ? <span key={d.key} className="sd-seg" style={{ width: `${(d.count / s.n) * 100}%`, background: SENT_COLOR[d.key] }} title={`${SENTIMENT_LABEL[d.key]}: ${d.count}`} /> : null))}
                      </div>
                      <div className="cmp-stats">
                        <span><b>{s.positivePct}%</b> positive</span>
                        <span><b>{s.avgSentiment.toFixed(1)}</b>/5 sentiment</span>
                        <span><b>{s.avgLike.toFixed(1)}</b>/5 {def.actionLabel.toLowerCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="sub">Which parts of your audience are most (and least) sold. Each bar is that segment&apos;s sentiment mix.</p>
            <div className="segstack">
              {segmentDetail.map((s) => (
                <details className={`segdrill ${s.n < thinCut ? "thin" : ""}`} key={s.segment}>
                  <summary>
                    <span className="sd-name">{s.segment} <span className="note">· n={s.n}{s.n < thinCut ? " · thin" : ""}</span></span>
                    <span className="sd-bar">
                      {s.dist.map((d) => (d.count > 0 ? <span key={d.key} className="sd-seg" style={{ width: `${(d.count / s.n) * 100}%`, background: SENT_COLOR[d.key] }} title={`${SENTIMENT_LABEL[d.key]}: ${d.count}`} /> : null))}
                    </span>
                    <span className={`sd-val ${sentBand(s.avgSentiment)}`}>{s.avgSentiment.toFixed(1)} · {s.positivePct}%+</span>
                  </summary>
                  <div className="segdrill-body">
                    {s.reactions.map((r) => (
                      <button className="tquote" key={r.personaId} onClick={() => setOpenR(r)}>
                        <span className="ico sm" style={{ background: SENT_COLOR[r.sentiment] }}>{monogram(r.personaName)}</span>
                        <span className="tq-txt"><b>{r.personaName}</b> <em>{SENTIMENT_LABEL[r.sentiment]} · {r.likelihood}/5</em><br />&ldquo;{r.quote}&rdquo;</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* The room */}
      <details className="rsec card" id="sec-room" open>
        <summary className="rsec-sum"><span className="rsec-t">The room</span><span className="rsec-hint">{reactions.length} individual reactions — click any card</span></summary>
        <div className="rsec-body">
          {statFilter && (
            <div className="roomactive">
              Showing <b>{filtered.length}</b> {STAT_LABEL[statFilter]} agents
              <button className="roomclear" onClick={() => setStatFilter("")}>Clear ×</button>
            </div>
          )}
          <div className="rfilters seg">
            <button className={`segchip ${segFilter === "all" && !statFilter ? "on" : ""}`} onClick={() => { setSegFilter("all"); setStatFilter(""); }}>All</button>
            {summary.bySegment.map((s) => (
              <button key={s.segment} className={`segchip ${segFilter === s.segment ? "on" : ""}`} onClick={() => setSegFilter((c) => (c === s.segment ? "all" : s.segment))}>
                {s.segment} <em>{s.n}</em>
              </button>
            ))}
          </div>
          <div className="participants">
            {filtered.slice(0, DISPLAY_MAX).map((r) => (
              <button key={r.personaId} className="pcard" style={{ borderLeftColor: SENT_COLOR[r.sentiment] }} onClick={() => setOpenR(r)}>
                <div className="phead">
                  <span className="ico">{monogram(r.personaName)}</span>
                  <div className="pwho">
                    <div className="pname">{r.personaName}</div>
                    <div className="pseg">{r.segment}</div>
                  </div>
                  <span className="fg-pick" style={{ color: SENT_COLOR[r.sentiment] }}>{SENTIMENT_LABEL[r.sentiment]}</span>
                </div>
                <div className="preact">&ldquo;{r.quote}&rdquo;</div>
                {r.journey && r.journey.length > 1 && (
                  <div className="walkpath">
                    {r.error && <span className="hop sim">simulated</span>}
                    {pathHops(r.journey).map((h, i) => (
                      <span className="hop" key={i}>{h}</span>
                    ))}
                  </div>
                )}
                <div className="pmore">Open reaction →</div>
              </button>
            ))}
          </div>
          {filtered.length > DISPLAY_MAX && <p className="note">Showing {DISPLAY_MAX} of {filtered.length} — the stats above use the full room.</p>}
        </div>
      </details>

      {/* What to fix first — end on a decision, not a chart */}
      {actionItems.length > 0 && (
        <section className="card fixboard">
          <h2 className="step">What to fix first</h2>
          <p className="sub">The concerns holding the room back, ranked by how many raised them and how strongly.</p>
          <ol className="fixlist">
            {actionItems.map((a, i) => (
              <li key={i}>
                <span className="fix-rank">{i + 1}</span>
                <span className="fix-heat" style={{ background: `color-mix(in srgb, var(--danger) ${Math.round((a.intensity / 5) * 100)}%, var(--line))` }} title={`intensity ${a.intensity.toFixed(1)}/5`} />
                <div className="fix-main">
                  <div className="fix-text">{a.text}</div>
                  {a.fix && <div className="fix-do"><b>Try:</b> {a.fix}</div>}
                  {a.rep && (
                    <button className="fix-quote" onClick={() => setOpenR(a.rep!)}>
                      &ldquo;{a.rep.quote}&rdquo; <span>— {a.rep.personaName}, {a.rep.segment}</span>
                    </button>
                  )}
                </div>
                <span className="fix-reach">{a.count} raised</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="caveat" style={{ maxWidth: 1080, margin: "0 auto 40px" }}>
        Each reaction comes from an individual persona-agent conditioned on its segment — the same
        persona-agent engine the rest of the app runs on (grounded in the MatrAIx persona-agent research;
        model-dependent and hypothesis-generating). Use it to sharpen the concept and surface objections
        early, not to predict the market. The more specific your description and prototypes, the sharper
        the read.
      </p>

      {openR && (
        <div className="pmodal-bg" onClick={() => setOpenR(null)}>
          <div className="pmodal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="pmodal-x" onClick={() => setOpenR(null)} aria-label="Close">×</button>
            <div className="pm-head">
              <span className="ico">{monogram(openR.personaName)}</span>
              <div className="pwho"><div className="pm-name">{openR.personaName}</div><div className="pseg">{openR.segment}</div></div>
              <span className="fg-pick" style={{ color: SENT_COLOR[openR.sentiment] }}>{SENTIMENT_LABEL[openR.sentiment]}</span>
            </div>
            {openR.journey && openR.journey.length > 0 && (
              <div className="pm-sec">
                <div className="pm-k">The path they took through the site</div>
                <ol className="walklist">
                  {openR.journey.map((s, i) => (
                    <li key={i}>
                      <span className={`wl-act ${s.action}`}>{s.action}</span>
                      {s.target && <span className="wl-tgt">{s.target}</span>}
                      <span className="wl-th">{s.thought}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="pm-sec"><div className="pm-k">In their words</div><p className="pm-quote">&ldquo;{openR.quote}&rdquo;</p></div>
            <div className="pm-sec"><div className="pm-k good">What resonates</div><p className="pm-p">{openR.resonates}</p></div>
            <div className="pm-sec"><div className="pm-k bad">Biggest concern</div><p className="pm-p">{openR.concern}</p></div>
            <div className="pm-sec"><div className="pm-k">Their question</div><p className="pm-p">{openR.question}</p></div>
            <div className="pm-sec"><div className="pm-k">Suggestion</div><p className="pm-p">{openR.suggestion}</p></div>
            <div className="pm-meta">{def.actionLabel}: {openR.likelihood}/5{openR.model ? ` · ${openR.model}` : ""}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// One provenance chip, used to say plainly "this is a simulated panel" without
// undermining usefulness. Amber dot on a thin sample, sapphire on a healthy one.
function ProvenanceChip({ n, isDemo }: { n: number; isDemo: boolean }) {
  const tone = isDemo ? "demo" : n < 12 ? "thin" : n >= 48 ? "strong" : "ok";
  const label = isDemo
    ? "Demo data · illustrative"
    : n < 12
      ? "Simulated panel · directional (small sample)"
      : "Simulated panel · directional signal";
  return (
    <span className={`provchip ${tone}`} title="Reactions come from AI persona-agents, not real people — directional signal for testing, not a market prediction.">
      <i />{label}
    </span>
  );
}
