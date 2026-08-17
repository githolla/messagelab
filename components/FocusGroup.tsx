"use client";

import { useMemo, useRef, useState } from "react";
import { INDUSTRIES } from "@/lib/industries";
import { autoSegments, scaleSegments, personaName, monogram, type PanelSegment } from "@/lib/archetypes";
import {
  FOCUS_KINDS,
  kindDef,
  PRODUCT_TYPES,
  SENTIMENTS,
  SENTIMENT_LABEL,
  focusDemo,
  summarizeFocus,
  type FocusKind,
  type FocusSubject,
  type FocusReaction,
  type FocusSummary,
  type Sentiment,
  FOCUS_VERDICT_LABEL,
} from "@/lib/focus";

const SIZES = [
  { label: "Small", n: 8 },
  { label: "Standard", n: 24 },
  { label: "Large", n: 60 },
  { label: "Big (demo)", n: 200 },
] as const;
const LIVE_MAX = 60;
const DEMO_MAX = 300;
const DISPLAY_MAX = 60;
const CONCURRENCY = 4;
const DEFAULT_TOTAL = 24;

const SENT_COLOR: Record<Sentiment, string> = {
  love: "#2f7a3a", like: "#7fae3f", neutral: "#b0873a", skeptical: "#c1662f", reject: "#b23b3b",
};
const sentBand = (v: number) => (v >= 4 ? "hi" : v >= 3 ? "mid" : "lo");

// Downscale an uploaded image to Claude's vision sweet spot and re-encode JPEG.
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
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("Could not read that image.")); };
    img.src = URL.createObjectURL(file);
  });
}

async function pool<T, R>(items: T[], worker: (t: T, i: number) => Promise<R>, concurrency: number, onDone?: () => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= items.length) return;
    out[idx] = await worker(items[idx], idx);
    onDone?.();
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return out;
}

export default function FocusGroup() {
  const [kind, setKind] = useState<FocusKind>("product");
  const [industry, setIndustry] = useState("general");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [segments, setSegments] = useState<PanelSegment[]>(() => autoSegments("general", undefined, DEFAULT_TOTAL));

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [reactions, setReactions] = useState<FocusReaction[]>([]);
  const [summary, setSummary] = useState<FocusSummary | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openR, setOpenR] = useState<FocusReaction | null>(null);
  const [segFilter, setSegFilter] = useState<string>("all");
  const resultsRef = useRef<HTMLDivElement>(null);

  const def = kindDef(kind);
  const plannedSize = segments.reduce((t, s) => t + s.count, 0);
  const liveSize = Math.min(plannedSize, LIVE_MAX);
  const industryLabel = INDUSTRIES.find((i) => i.key === industry)?.label ?? "general";

  function changeIndustry(k: string) {
    setIndustry(k);
    setSegments((prev) => autoSegments(k, undefined, prev.reduce((t, s) => t + s.count, 0) || DEFAULT_TOTAL));
  }
  function resize(n: number) {
    setSegments((prev) => scaleSegments(prev, Math.max(prev.length, Math.min(DEMO_MAX, n))));
  }
  function setCount(id: string, n: number) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, count: Math.max(0, Math.min(DEMO_MAX, Math.round(n) || 0)) } : s)));
  }

  async function onImages(files: FileList | null) {
    if (!files) return;
    try {
      const urls = await Promise.all([...files].slice(0, 4 - images.length).map((f) => fileToDataUrl(f)));
      setImages((p) => [...p, ...urls].slice(0, 4));
      setError(null);
    } catch {
      setError("Could not read one of those images.");
    }
  }

  async function fetchScreenshot() {
    const u = url.trim();
    if (!u || fetching || images.length >= 4) return;
    setFetching(true);
    setError(null);
    try {
      const resp = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setImages((p) => [...p, data.dataUrl].slice(0, 4));
      if (!body.trim()) setBody(`Reviewing the page at ${u}`);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not capture that URL.");
    } finally {
      setFetching(false);
    }
  }

  function buildPanel(segs: PanelSegment[]) {
    const out: { id: string; name: string; segment: string; how: string; base: number }[] = [];
    for (const s of segs) for (let i = 0; i < s.count; i++) {
      const id = `${s.id}:${i}`;
      // Recenter the archetype's act-propensity (often low) toward a neutral
      // focus-group baseline so the demo reads realistically, not universally sour.
      out.push({ id, name: personaName(id), segment: s.name, how: s.how, base: 0.48 + s.base * 0.3 });
    }
    return out;
  }

  function subjectOf(): FocusSubject {
    return { kind, industry, productType: kind === "product" ? productType : "", title, body, images: def.images ? images : [] };
  }

  function finish(rs: FocusReaction[], demo: boolean) {
    setReactions(rs);
    setSummary(summarizeFocus(rs, kind));
    setIsDemo(demo);
    setSegFilter("all");
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function runDemo() {
    if (!body.trim()) { setError("Add what you want the focus group to review."); return; }
    setError(null);
    const subject = subjectOf();
    const panel = buildPanel(plannedSize > DEMO_MAX ? scaleSegments(segments, DEMO_MAX) : segments);
    finish(panel.map((p) => focusDemo(p, subject)), true);
  }

  async function runLive() {
    if (!body.trim()) { setError("Add what you want the focus group to review."); return; }
    setError(null);
    setRunning(true);
    setDone(0);
    const subject = subjectOf();
    const panel = buildPanel(scaleSegments(segments, liveSize));
    const rs = await pool<typeof panel[number], FocusReaction>(
      panel,
      async (p) => {
        try {
          const resp = await fetch("/api/focus", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ persona: { id: p.id, name: p.name, segment: p.segment, how: p.how }, subject }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          return data as FocusReaction;
        } catch {
          return focusDemo(p, subject); // per-persona fallback so a partial outage still fills the room
        }
      },
      CONCURRENCY,
      () => setDone((d) => d + 1),
    );
    setRunning(false);
    finish(rs, false);
  }

  const filtered = useMemo(
    () => (segFilter === "all" ? reactions : reactions.filter((r) => r.segment === segFilter)),
    [reactions, segFilter],
  );

  return (
    <>
      <div className="pagehead">
        <h1>Focus Group</h1>
        <p>
          Put anything in front of a simulated focus group — a new product or prototype, a website, a
          go-to-market, sales, or social strategy, a concept or campaign. It&apos;s a panel of intelligent
          persona-agents that each react in character; you get an overview, sentiment &amp; likelihood stats,
          the themes they raise, and the full room.
        </p>
      </div>

      {/* 1 · What are you testing */}
      <section className="card">
        <h2 className="step">1 · What are you testing?</h2>
        <div className="kindgrid">
          {FOCUS_KINDS.map((k) => (
            <button key={k.key} className={`kindcard ${kind === k.key ? "on" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(k.key)} disabled={running}>
              <div className="kind-t">{k.label}</div>
              <div className="kind-b">{k.blurb}</div>
            </button>
          ))}
        </div>
        <div className="grid2" style={{ marginTop: 14 }}>
          <div>
            <label className="fld" htmlFor="fg-industry">Industry</label>
            <select id="fg-industry" value={industry} onChange={(e) => changeIndustry(e.target.value)} disabled={running}>
              {INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
            </select>
          </div>
          {kind === "product" && (
            <div>
              <label className="fld" htmlFor="fg-ptype">Type</label>
              <select id="fg-ptype" value={productType} onChange={(e) => setProductType(e.target.value)} disabled={running}>
                {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* 2 · The subject */}
      <section className="card">
        <h2 className="step">2 · {def.subjectLabel}</h2>
        <p className="sub">Draft it here or paste from your doc. {def.images ? "Attach prototypes, mockups, or screenshots to have the panel react to the visuals." : ""}</p>
        <label className="fld" htmlFor="fg-title">Title / name <span className="note" style={{ fontWeight: 400 }}>· optional</span></label>
        <input id="fg-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme Insights — real-time analytics for ops teams" disabled={running} />
        <label className="fld" htmlFor="fg-body" style={{ marginTop: 12 }}>Details</label>
        <textarea id="fg-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder={def.placeholder} disabled={running} />
        {kind === "website" && images.length < 4 && (
          <div className="urlfetch" style={{ marginTop: 12 }}>
            <label className="fld" htmlFor="fg-url">Paste a link <span className="note" style={{ fontWeight: 400 }}>· we screenshot the page for the panel</span></label>
            <div className="urlrow">
              <input
                id="fg-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fetchScreenshot(); } }}
                placeholder="https://example.com/landing"
                disabled={running || fetching}
              />
              <button className="btn ghost" onClick={fetchScreenshot} disabled={running || fetching || !url.trim()}>
                {fetching ? "Capturing…" : "Fetch screenshot"}
              </button>
            </div>
            <p className="note" style={{ marginTop: 6 }}>Some sites block headless browsers or need a login — if capture fails, add a screenshot below instead.</p>
          </div>
        )}
        {def.images && (
          <div style={{ marginTop: 12 }}>
            <div className="fgh" style={{ margin: 0 }}>
              <label className="fld" style={{ margin: 0 }}>Prototypes / visuals <span className="note" style={{ fontWeight: 400 }}>· up to 4</span></label>
              {images.length < 4 && (
                <label className="btn ghost filebtn" style={{ padding: "5px 11px", fontSize: 12 }}>
                  Add image
                  <input type="file" accept="image/*" multiple onChange={(e) => { onImages(e.target.files); e.currentTarget.value = ""; }} />
                </label>
              )}
            </div>
            {images.length > 0 && (
              <div className="protorow">
                {images.map((src, i) => (
                  <div className="proto" key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Prototype ${i + 1}`} />
                    <button className="proto-x" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} aria-label="Remove">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3 · The focus group */}
      <section className="card">
        <div className="fgh" style={{ marginTop: 0 }}>
          <h2 className="step" style={{ margin: 0 }}>3 · The focus group</h2>
          <div className="seg" role="group" aria-label="Size" style={{ marginBottom: 0 }}>
            {SIZES.map((s) => (
              <button key={s.n} className={plannedSize === s.n ? "on" : ""} onClick={() => resize(s.n)} disabled={running}>{s.label}</button>
            ))}
          </div>
        </div>
        <p className="projn" style={{ marginTop: 4 }}>
          A <b>{plannedSize.toLocaleString()}-person {industryLabel.toLowerCase()}</b> panel of persona-agents across{" "}
          {segments.length} segments — each one reacts individually and in character, not as an average.
          {plannedSize > LIVE_MAX && <> Live runs a representative {LIVE_MAX}; demo runs the whole panel.</>}
        </p>
        <div className="segeditor" style={{ marginTop: 12 }}>
          {segments.map((s) => (
            <div className="segrow" key={s.id}>
              <span className="ico">{monogram(s.name)}</span>
              <div className="segmain">
                <div className="segname" style={{ padding: "4px 0" }}>{s.name}</div>
                <div className="seghow" style={{ padding: 0 }}>{s.how}</div>
              </div>
              <div className="segcount">
                <button onClick={() => setCount(s.id, s.count - 1)} disabled={running} aria-label="Fewer">−</button>
                <input type="number" min={0} value={s.count} onChange={(e) => setCount(s.id, Number(e.target.value))} disabled={running} />
                <button onClick={() => setCount(s.id, s.count + 1)} disabled={running} aria-label="More">+</button>
              </div>
              <span className="segpct">{Math.round((s.count / (plannedSize || 1)) * 100)}%</span>
            </div>
          ))}
        </div>

        <div className="runbar" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={runLive} disabled={running || !body.trim()}>
            {running ? `Convening… ${done}/${liveSize}` : "Convene the focus group"}
          </button>
          <button className="btn ghost" onClick={runDemo} disabled={running}>Load demo</button>
          {running && <div className="progress"><div style={{ width: `${liveSize ? (done / liveSize) * 100 : 0}%` }} /></div>}
          <span className="note">
            {running ? `${done}/${liveSize} reacting…` : `${plannedSize > LIVE_MAX ? `${LIVE_MAX} live · ` : ""}~1–2 min · demo is instant & free`}
          </span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {/* Results */}
      {summary && reactions.length > 0 && (
        <div ref={resultsRef}>
          {/* Overview hero */}
          <section className={`card fg-hero ${summary.verdict}`}>
            <div className="fg-herotop">
              <div>
                <div className="fg-k">Focus group verdict{isDemo && <span className="demotag" style={{ marginLeft: 8 }}>Demo</span>}</div>
                <div className="fg-badge-wrap"><span className={`fg-badge ${summary.verdict}`}>{FOCUS_VERDICT_LABEL[summary.verdict]}</span></div>
                <p className="fg-headline">{summary.headline}</p>
              </div>
            </div>
            <div className="fg-stats">
              <div className="fg-stat"><div className="fg-stat-n">{summary.positivePct}%</div><div className="fg-stat-l">Positive</div></div>
              <div className="fg-stat"><div className={`fg-stat-n ${sentBand(summary.avgSentiment)}`}>{summary.avgSentiment.toFixed(1)}<span>/5</span></div><div className="fg-stat-l">Avg sentiment</div></div>
              <div className="fg-stat"><div className={`fg-stat-n ${sentBand(summary.avgLikelihood)}`}>{summary.avgLikelihood.toFixed(1)}<span>/5</span></div><div className="fg-stat-l">{def.actionLabel}</div></div>
              <div className="fg-stat"><div className="fg-stat-n">{summary.n}</div><div className="fg-stat-l">In the room</div></div>
            </div>
          </section>

          {/* Charts */}
          <section className="card">
            <div className="fg-charts">
              <div>
                <div className="sb-h">Sentiment across the room</div>
                <div className="prefbar">
                  {summary.sentimentDist.map((s) => {
                    const pct = (s.count / summary.n) * 100;
                    return s.count > 0 ? (
                      <span key={s.key} className="pf" style={{ width: `${pct}%`, background: SENT_COLOR[s.key] }} title={`${SENTIMENT_LABEL[s.key]}: ${s.count}`}>
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
                        <span className="likebar"><span className={sentBand(i + 1)} style={{ width: `${Math.max(2, (c / max) * 100)}%` }} /></span>
                        <span className="likenum">{c}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Themes */}
          <section className="card">
            <h2 className="step">What the room said</h2>
            <p className="sub">The themes that came up most — what resonated, their concerns, questions, and suggestions.</p>
            <div className="themegrid">
              {([
                { k: "resonates", label: "What resonates", cls: "good" },
                { k: "concerns", label: "Concerns", cls: "bad" },
                { k: "questions", label: "Questions they'd ask", cls: "" },
                { k: "suggestions", label: "Suggestions", cls: "" },
              ] as const).map((col) => (
                <div className="themecol" key={col.k}>
                  <div className={`theme-h ${col.cls}`}>{col.label}</div>
                  <ul>
                    {summary.themes[col.k].map((t, i) => (
                      <li key={i}>{t.count > 1 && <span className="theme-n">{t.count}×</span>} {t.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* By segment */}
          {summary.bySegment.length > 1 && (
            <section className="card">
              <h2 className="step">By segment</h2>
              <p className="sub">Which parts of your audience are most (and least) sold.</p>
              <div className="segbars">
                {summary.bySegment.map((s) => (
                  <div className="segbar" key={s.segment}>
                    <span className="sbar-name">{s.segment} <span className="note">· n={s.n}</span></span>
                    <span className="sbar-track"><span className={sentBand(s.avgSentiment)} style={{ width: `${(s.avgSentiment / 5) * 100}%` }} /></span>
                    <span className="sbar-val">{s.avgSentiment.toFixed(1)} · {s.positivePct}% +</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* The room */}
          <section className="card">
            <div className="fgh" style={{ marginTop: 0 }}>
              <h2 className="step" style={{ margin: 0 }}>The room — {reactions.length} reactions</h2>
            </div>
            <div className="rfilters seg">
              <button className={`segchip ${segFilter === "all" ? "on" : ""}`} onClick={() => setSegFilter("all")}>All</button>
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
                  <div className="pmore">Open reaction →</div>
                </button>
              ))}
            </div>
            {filtered.length > DISPLAY_MAX && <p className="note">Showing {DISPLAY_MAX} of {filtered.length} — the stats above use the full room.</p>}
          </section>

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
      )}
    </>
  );
}
