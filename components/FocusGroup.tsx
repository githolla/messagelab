"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INDUSTRIES } from "@/lib/industries";
import { autoSegments, scaleSegments, personaName, monogram, type PanelSegment } from "@/lib/archetypes";
import {
  FOCUS_KINDS,
  kindDef,
  PRODUCT_TYPES,
  MAX_FOCUS_AREAS,
  focusDemo,
  type FocusKind,
  type FocusSubject,
  type FocusReaction,
  type Sentiment,
  type WalkStep,
} from "@/lib/focus";

const SIZES = [
  { label: "Small", n: 8 },
  { label: "Standard", n: 24 },
  { label: "Large", n: 60 },
  { label: "Big (demo)", n: 200 },
] as const;
const LIVE_MAX = 60;
const DEMO_MAX = 300;
const CONCURRENCY = 4;
const DEFAULT_TOTAL = 24;
const WALK_MIN = 2;
const WALK_MAX = 6; // live browser sessions are heavy — keep the walking party small
const WALK_STEPS = 5;
const WALK_CONCURRENCY = 2;

// The form the thing under test takes — reshapes the recipe + what the panel weighs.
const FORMATS = ["Email", "Direct mail", "Social post", "Landing page", "Ad / banner", "Pitch deck", "One-pager", "Other"] as const;

// Categorical avatar colors for the segment cards (white monogram on top — all dark enough).
const SEG_COLORS = ["#2b45c4", "#0f766e", "#7c3aed", "#b45309", "#9a3412", "#1d4ed8", "#4d7c0f", "#a21caf", "#0369a1", "#b91c1c"];
function segColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SEG_COLORS[h % SEG_COLORS.length];
}

// Sentiment dot colors for the live "convening" loader (matches the report scale).
const SENT_DOT: Record<Sentiment, string> = {
  love: "#2f7a3a", like: "#7fae3f", neutral: "#767c85", skeptical: "#db7f22", reject: "#b23b3b",
};

// A distinct accent per industry so switching verticals visibly re-themes the room.
const INDUSTRY_ACCENTS = ["#2b45c4", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#0369a1", "#4d7c0f", "#a21caf", "#c2410c", "#15803d", "#4338ca", "#0e7490"];
function accentFor(key: string): string {
  const idx = INDUSTRIES.findIndex((i) => i.key === key);
  return INDUSTRY_ACCENTS[(idx < 0 ? 0 : idx) % INDUSTRY_ACCENTS.length];
}

// Format-adaptive labels + scaffolded placeholders for Step 2.
interface FmtMeta { titleLabel: string; titlePlaceholder: string; bodyLabel: string; bodyPlaceholder: string; }
function fmtMeta(format: string, def: { placeholder: string }): FmtMeta {
  switch (format) {
    case "Email":
      return { titleLabel: "Subject line", titlePlaceholder: "e.g. Your July report is ready — 3 things to check",
        bodyLabel: "Email body", bodyPlaceholder: "Preheader / preview text…\n\nHi [First name],\n\n[Opening hook]\n[The value or offer]\n[One proof point or detail]\n\n[Primary call-to-action]\n\n— [Sender]" };
    case "Direct mail":
      return { titleLabel: "Headline / teaser", titlePlaceholder: "e.g. A letter for someone who's helped before",
        bodyLabel: "Letter copy", bodyPlaceholder: "Dear [Name],\n\n[Personal opening]\n[The story / the need]\n[The ask — be specific about the amount and impact]\n\n[Signature]\n\nP.S. [The P.S. people actually read first]" };
    case "Social post":
      return { titleLabel: "Hook / first line", titlePlaceholder: "e.g. We almost didn't ship this…",
        bodyLabel: "Post copy", bodyPlaceholder: "[Scroll-stopping hook]\n\n[The point in a line or two]\n\n[Call-to-action]\n\n#hashtags" };
    case "Landing page":
      return { titleLabel: "Headline", titlePlaceholder: "e.g. Ship your message before it's real",
        bodyLabel: "Page copy", bodyPlaceholder: "Headline: [the big promise]\nSubhead: [who it's for + why it matters]\n\n[3 key benefits]\n[Social proof]\n\nPrimary CTA: [button text]" };
    case "Ad / banner":
      return { titleLabel: "Headline", titlePlaceholder: "e.g. Test it on 1,000 customers. Today.",
        bodyLabel: "Ad copy", bodyPlaceholder: "Headline: […]\nBody: […]\nCTA: […]\nWhere it runs: [platform / placement]" };
    case "Pitch deck":
      return { titleLabel: "Deck title", titlePlaceholder: "e.g. Acme — Series A",
        bodyLabel: "Narrative / key slides", bodyPlaceholder: "Problem → Solution → Why now → How it works → Traction / proof → The ask. Paste the narrative or your key slides…" };
    case "One-pager":
      return { titleLabel: "Title", titlePlaceholder: "e.g. Acme Insights — one-pager",
        bodyLabel: "One-pager copy", bodyPlaceholder: "Headline, the problem, your solution, proof, and the ask — the whole thing on one page…" };
    default:
      return { titleLabel: "Title / name", titlePlaceholder: "e.g. Acme Insights — real-time analytics for ops teams",
        bodyLabel: "Details", bodyPlaceholder: def.placeholder };
  }
}

// A short deterministic path for the no-key demo so the walkthrough UI has
// something to show without launching a browser.
const DEMO_HOPS = [
  ["Home", "Pricing", "Sign up"],
  ["Home", "Features", "Get started"],
  ["Home", "About", "Contact"],
  ["Home", "How it works", "Pricing", "Sign up"],
  ["Home", "Blog", "Home"],
];
function demoJourney(id: string, sentiment: Sentiment): WalkStep[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hops = DEMO_HOPS[h % DEMO_HOPS.length];
  const steps: WalkStep[] = hops.map((t, i) => ({
    n: i,
    action: i === 0 ? "start" : "click",
    target: t,
    url: "#",
    thought: i === 0 ? "Landed on the site." : `Went to ${t} to learn more.`,
  }));
  steps.push({
    n: hops.length,
    action: "done",
    url: "#",
    thought: sentiment === "reject" || sentiment === "skeptical" ? "Left without acting." : "Seen enough to decide.",
  });
  return steps;
}

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
  const [siteMode, setSiteMode] = useState<"walk" | "react">("walk");
  const [walkers, setWalkers] = useState(4);
  const [format, setFormat] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [context, setContext] = useState<string>("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [areaText, setAreaText] = useState<string>("");
  const [planText, setPlanText] = useState<string>("");
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState<string>("");
  const [clarifyQs, setClarifyQs] = useState<string[]>([]);
  const [clarifyAs, setClarifyAs] = useState<string[]>([]);
  const [clarifying, setClarifying] = useState(false);
  const [clarifyNote, setClarifyNote] = useState<string>("");
  const [segments, setSegments] = useState<PanelSegment[]>(() => autoSegments("general", undefined, DEFAULT_TOTAL));

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [filled, setFilled] = useState<Record<string, Sentiment>>({});
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const def = kindDef(kind);
  const plannedSize = segments.reduce((t, s) => t + s.count, 0);
  const liveSize = Math.min(plannedSize, LIVE_MAX);
  const industryLabel = INDUSTRIES.find((i) => i.key === industry)?.label ?? "general";
  const isWalk = kind === "website" && siteMode === "walk";
  const walkCount = Math.max(WALK_MIN, Math.min(WALK_MAX, walkers));
  const industryAccent = accentFor(industry);
  const fm = fmtMeta(format, def);

  // Live forecast of the run — a unit-chart "room" + reach/time/calls.
  const DOT_CAP = 160;
  const roomDots: string[] = [];
  for (const s of segments) for (let i = 0; i < s.count && roomDots.length < DOT_CAP + 1; i++) roomDots.push(segColor(s.id));
  const dotsShown = roomDots.slice(0, DOT_CAP);
  const dotsRest = Math.max(0, plannedSize - dotsShown.length);
  const runCount = isWalk ? walkCount : liveSize;
  const estSec = isWalk ? Math.ceil(walkCount / WALK_CONCURRENCY) * 45 : Math.ceil(liveSize / CONCURRENCY) * 3;
  const estLabel = estSec < 90 ? `~${estSec}s` : `~${Math.max(1, Math.round(estSec / 60))} min`;
  const shares = segments.map((s) => s.count / (plannedSize || 1));
  const balanceGap = Math.round((Math.max(...shares, 0) - Math.min(...shares, 0)) * 100);

  // Panel health — three defensibility rules with a plain read or the fix.
  const nonZeroSegs = segments.filter((s) => s.count > 0).length;
  const maxShare = Math.max(...shares, 0);
  const healthRules = [
    { ok: plannedSize >= 12, fix: `${plannedSize} agents is illustrative, not statistical — grow to 12+ for a firmer read.` },
    { ok: maxShare <= 0.5, fix: `One segment is ${Math.round(maxShare * 100)}% of the room — it'll over-index. Even it out.` },
    { ok: nonZeroSegs >= 3, fix: `Only ${nonZeroSegs} active segment${nonZeroSegs === 1 ? "" : "s"} — add more for coverage.` },
  ];
  const healthScore = healthRules.filter((r) => r.ok).length / healthRules.length;
  const healthMsg = healthRules.find((r) => !r.ok)?.fix || "Well-balanced — a defensible read for a directional test.";

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
  function renameSeg(id: string, name: string) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function removeSeg(id: string) {
    setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  // Reset the segment mix to the industry's balanced reference at the current size.
  function balanceToIndustry() {
    setSegments(autoSegments(industry, undefined, plannedSize || DEFAULT_TOTAL));
  }
  function addSeg() {
    setSegments((prev) => {
      const avg = Math.max(1, Math.round(prev.reduce((t, s) => t + s.count, 0) / (prev.length || 1)));
      const id = `custom-${Date.now()}-${prev.length}`;
      return [...prev, { id, name: "New segment", how: "Describe this part of the audience", base: 0.5, count: avg }];
    });
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

  // Goal-first intake: turn a plain question into a drafted study, then apply it.
  async function designStudy() {
    const q = planText.trim();
    if (!q || planning) return;
    setPlanning(true);
    setPlanNote("");
    try {
      const resp = await fetch("/api/focus-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: q }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      const p = data.plan as { kind: FocusKind; industry: string; format: string; title: string; body: string; goal: string; context?: string; focusAreas?: string[] };
      setKind(p.kind);
      changeIndustry(p.industry);
      setFormat(p.format || "");
      setTitle(p.title || "");
      setBody(p.body || "");
      setGoal(p.goal || q);
      setContext(p.context || "");
      setFocusAreas((p.focusAreas || []).slice(0, MAX_FOCUS_AREAS));
      setPlanNote(data.source === "model" ? "Drafted your study below — edit anything, then run." : "Drafted a starting point below (no API key — a rough draft). Edit it, then run.");
    } catch (e) {
      setPlanNote(e instanceof Error ? e.message : "Couldn't design the study — set it up below instead.");
    } finally {
      setPlanning(false);
    }
  }

  // The group asks a few short questions about the subject; answers fold back
  // into the brief so every persona-agent reacts with the missing context.
  async function askClarify() {
    if (!body.trim() || clarifying) return;
    setClarifying(true);
    setClarifyNote("");
    try {
      const resp = await fetch("/api/focus-clarify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, title, body, goal }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      const qs = (data.questions as string[]) || [];
      setClarifyQs(qs);
      setClarifyAs(qs.map(() => ""));
    } catch (e) {
      setClarifyNote(e instanceof Error ? e.message : "Couldn't get questions — the room will work with what's there.");
    } finally {
      setClarifying(false);
    }
  }
  function applyClarify() {
    const pairs = clarifyQs.map((q, i) => ({ q, a: (clarifyAs[i] || "").trim() })).filter((p) => p.a);
    if (pairs.length) {
      setBody((b) => `${b.trim()}\n\nA few things the group asked:\n${pairs.map((p) => `${p.q} ${p.a}`).join("\n")}`);
      setClarifyNote(`Added ${pairs.length} answer${pairs.length === 1 ? "" : "s"} to the brief.`);
    } else {
      setClarifyNote("");
    }
    setClarifyQs([]);
    setClarifyAs([]);
  }

  function addFocusArea() {
    const t = areaText.trim();
    if (!t || focusAreas.length >= MAX_FOCUS_AREAS) return;
    if (!focusAreas.some((a) => a.toLowerCase() === t.toLowerCase())) setFocusAreas((p) => [...p, t.slice(0, 120)]);
    setAreaText("");
  }

  function subjectOf(): FocusSubject {
    return {
      kind, industry, productType: kind === "product" ? productType : "", format, goal,
      context: context.trim() || undefined,
      focusAreas: focusAreas.length ? focusAreas : undefined,
      title, body, images: def.images ? images : [],
    };
  }

  // Hand the completed run to the dedicated report page (no DB in v1 — the run
  // rides across the navigation in sessionStorage), including the panel + subject
  // so the report can re-run refinements against the same room.
  function finish(rs: FocusReaction[], demo: boolean, panel: { id: string; name: string; segment: string; how: string; base: number }[], subject: FocusSubject) {
    try {
      sessionStorage.setItem(
        "fg-report",
        JSON.stringify({
          round0: { title: subject.title, body: subject.body, reactions: rs },
          subject,
          panel,
          kind,
          industry,
          url: url.trim(),
          isDemo: demo,
          goal: goal.trim(),
          format,
        }),
      );
    } catch {
      /* quota/availability — navigation below still no-ops gracefully */
    }
    router.push("/test/report");
  }

  function runDemo() {
    if (!body.trim()) { setError("Add what you want the focus group to review."); return; }
    setError(null);
    const subject = subjectOf();
    const panel = buildPanel(plannedSize > DEMO_MAX ? scaleSegments(segments, DEMO_MAX) : segments);
    finish(panel.map((p) => focusDemo(p, subject)), true, panel, subject);
  }

  async function runLive() {
    if (!body.trim()) { setError("Add what you want the focus group to review."); return; }
    setError(null);
    setRunning(true);
    setDone(0);
    const subject = subjectOf();
    const panel = buildPanel(scaleSegments(segments, liveSize));
    setRoster(panel.map((p) => ({ id: p.id, name: p.name })));
    setFilled({});
    const rs = await pool<typeof panel[number], FocusReaction>(
      panel,
      async (p) => {
        let result: FocusReaction;
        try {
          const resp = await fetch("/api/focus", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ persona: { id: p.id, name: p.name, segment: p.segment, how: p.how }, subject }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          result = data as FocusReaction;
        } catch {
          result = focusDemo(p, subject); // per-persona fallback so a partial outage still fills the room
        }
        setFilled((prev) => ({ ...prev, [p.id]: result.sentiment }));
        return result;
      },
      CONCURRENCY,
      () => setDone((d) => d + 1),
    );
    setRunning(false);
    finish(rs, false, panel, subject);
  }

  // Website walkthrough: a small party of persona-agents each drives a live
  // browser through the site and reports back its journey + reaction.
  async function runWalk() {
    if (!url.trim()) { setError("Paste the URL you want the panel to walk through."); return; }
    setError(null);
    setRunning(true);
    setDone(0);
    const n = Math.max(WALK_MIN, Math.min(WALK_MAX, walkers));
    const panel = buildPanel(scaleSegments(segments, n)).slice(0, n);
    setRoster(panel.map((p) => ({ id: p.id, name: p.name })));
    setFilled({});
    const subject = { url: url.trim(), industry, title, body };
    let realCount = 0;
    let firstErr = "";
    const rs = await pool<typeof panel[number], FocusReaction>(
      panel,
      async (p) => {
        let result: FocusReaction;
        try {
          const resp = await fetch("/api/focus-walk", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ persona: { id: p.id, name: p.name, segment: p.segment, how: p.how }, subject, maxSteps: WALK_STEPS }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          realCount++;
          result = data as FocusReaction;
        } catch (e) {
          if (!firstErr) firstErr = e instanceof Error ? e.message : "the walk service failed";
          const fb = focusDemo(p, { kind: "website", industry, productType: "", title, body, images: [] });
          // Mark it as a simulated fallback so we never pass it off as a real walk.
          result = { ...fb, journey: demoJourney(p.id, fb.sentiment), error: firstErr };
        }
        setFilled((prev) => ({ ...prev, [p.id]: result.sentiment }));
        return result;
      },
      WALK_CONCURRENCY,
      () => setDone((d) => d + 1),
    );
    setRunning(false);
    if (realCount === 0) {
      const needsKey = /API key|not configured|ANTHROPIC/i.test(firstErr);
      setError(
        `The panel couldn't browse the site live — ${firstErr}. ` +
          (needsKey
            ? "A live walkthrough needs ANTHROPIC_API_KEY set on the server (the same key the focus group uses). "
            : "Some sites block headless browsers, need a login, or are slow to load — try another URL. ") +
          "The results below are a simulated walkthrough, not a real one.",
      );
    } else if (realCount < panel.length) {
      setError(`${panel.length - realCount} of ${panel.length} walks fell back to a simulated journey (${firstErr}). The rest are real.`);
    }
    const walkSubject: FocusSubject = { kind: "website", industry, productType: "", format, goal, context: context.trim() || undefined, focusAreas: focusAreas.length ? focusAreas : undefined, title, body: url.trim(), images: [] };
    finish(rs, realCount === 0, panel, walkSubject);
  }

  function runWalkDemo() {
    setError(null);
    const n = Math.max(WALK_MIN, Math.min(WALK_MAX, walkers));
    const panel = buildPanel(scaleSegments(segments, n)).slice(0, n);
    const subject: FocusSubject = { kind: "website", industry, productType: "", format, goal, context: context.trim() || undefined, focusAreas: focusAreas.length ? focusAreas : undefined, title, body: body || `A ${industryLabel} website`, images: [] };
    finish(panel.map((p) => { const r = focusDemo(p, subject); return { ...r, journey: demoJourney(p.id, r.sentiment) }; }), true, panel, subject);
  }

  return (
    <>
      <div className="pagehead">
        <h1>Focus Group</h1>
        <p>
          Put anything in front of a simulated focus group — a new product or prototype, a website, a
          go-to-market, sales, or social strategy, a concept or campaign, or literally anything else,
          down to &ldquo;I want to eat steak tonight.&rdquo; It&apos;s a panel of intelligent
          persona-agents that each react in character — and for a live website, they&apos;ll each
          <em> walk through the site themselves</em>, click by click, and report back. You get an overview,
          sentiment &amp; likelihood stats, the themes they raise, and the full room.
        </p>
      </div>

      {/* 0 · Start from a question */}
      <section className="card step0">
        <h2 className="step">Start with a question <span className="note" style={{ fontWeight: 400 }}>· optional — we&apos;ll set up the study</span></h2>
        <div className="step0-row">
          <input
            className="step0-in"
            type="text"
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); designStudy(); } }}
            placeholder="Anything at all — “Will a matching-gift email win back lapsed donors?” or “I want to eat steak tonight”"
            disabled={planning || running}
          />
          <button className="btn primary" onClick={designStudy} disabled={planning || running || !planText.trim()}>
            {planning ? "Designing…" : "Design my study →"}
          </button>
        </div>
        {planNote && <p className="note" style={{ marginTop: 8 }}>{planNote}</p>}
        <p className="sub" style={{ marginTop: planNote ? 4 : 10 }}>We&apos;ll pick the subject type, industry, format, and draft what to test — you edit everything below. Or just fill it in yourself.</p>
      </section>

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
            <label className="fld" htmlFor="fg-industry">Industry <span className="note" style={{ fontWeight: 400 }}>· sets who&apos;s in the room</span></label>
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
        <div style={{ marginTop: 14 }}>
          <label className="fld">Format <span className="note" style={{ fontWeight: 400 }}>· what form is it in? (optional — shapes what the room reacts to)</span></label>
          <div className="fmtchips">
            {FORMATS.map((f) => (
              <button key={f} type="button" className={`fmtchip ${format === f ? "on" : ""}`} aria-pressed={format === f} onClick={() => setFormat((c) => (c === f ? "" : f))} disabled={running}>{f}</button>
            ))}
          </div>
        </div>
        <div className="goalfield" style={{ marginTop: 14 }}>
          <label className="fld" htmlFor="fg-goal">What are you trying to learn? <span className="note" style={{ fontWeight: 400 }}>· optional — the report answers this directly</span></label>
          <input id="fg-goal" type="text" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. How do we make the site attractive without strong social proof yet?" disabled={running} />
        </div>

        {/* Brief the room — background + the lenses to weigh */}
        <div className="roombrief" style={{ marginTop: 14 }}>
          <label className="fld" htmlFor="fg-context">Brief the room <span className="note" style={{ fontWeight: 400 }}>· optional — background every persona is told before reacting</span></label>
          <textarea
            id="fg-context"
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Your real situation — constraints, known weaknesses, what's true right now. e.g. We're early: our social proof is thin — few testimonials, no big-name logos yet. The site has to earn trust other ways."
            disabled={running}
          />
          <label className="fld" htmlFor="fg-area" style={{ marginTop: 10 }}>Focus the room on <span className="note" style={{ fontWeight: 400 }}>· up to {MAX_FOCUS_AREAS} — every persona weighs these specifically</span></label>
          <div className="arearow">
            <input
              id="fg-area"
              type="text"
              value={areaText}
              onChange={(e) => setAreaText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFocusArea(); } }}
              placeholder="e.g. credibility without testimonials · appeal to AI agents browsing the site"
              disabled={running || focusAreas.length >= MAX_FOCUS_AREAS}
            />
            <button className="btn ghost" onClick={addFocusArea} disabled={running || !areaText.trim() || focusAreas.length >= MAX_FOCUS_AREAS}>Add</button>
          </div>
          {focusAreas.length > 0 && (
            <div className="fmtchips" style={{ marginTop: 8 }}>
              {focusAreas.map((a) => (
                <span className="fmtchip on areachip" key={a}>
                  {a}
                  <button className="areachip-x" onClick={() => setFocusAreas((p) => p.filter((x) => x !== a))} disabled={running} aria-label={`Remove ${a}`}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2 · The subject */}
      <section className="card">
        <h2 className="step">2 · {def.subjectLabel}{format ? <span className="fmt-tag" style={{ background: industryAccent }}>{format}</span> : null}</h2>
        <p className="sub">
          {format
            ? `Structured for ${/^[aeiou]/i.test(format) ? "an" : "a"} ${format.toLowerCase()} — fill in the scaffold or paste your own. `
            : "Draft it here or paste from your doc. "}
          {def.images ? "Attach prototypes, mockups, or screenshots to have the panel react to the visuals." : ""}
        </p>
        <label className="fld" htmlFor="fg-title">{fm.titleLabel} <span className="note" style={{ fontWeight: 400 }}>· optional</span></label>
        <input id="fg-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={fm.titlePlaceholder} disabled={running} />
        <label className="fld" htmlFor="fg-body" style={{ marginTop: 12 }}>{fm.bodyLabel}</label>
        <textarea id="fg-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder={fm.bodyPlaceholder} disabled={running} />

        {/* Clarify — the group asks a few questions; answers fold into the brief */}
        <div className="clarify" style={{ marginTop: 12 }}>
          {clarifyQs.length === 0 ? (
            <div className="clarify-cta">
              <button className="btn ghost" onClick={askClarify} disabled={running || clarifying || !body.trim()}>
                {clarifying ? "The group is thinking…" : "Let the group ask a few questions →"}
              </button>
              <span className="note">Optional — the room asks what it needs to know, your answers sharpen its feedback.</span>
            </div>
          ) : (
            <div className="clarify-panel">
              <div className="clarify-h">Before it reacts, the group wants to know <span className="note" style={{ fontWeight: 400 }}>· answer any, skip the rest</span></div>
              {clarifyQs.map((q, i) => (
                <div className="clarify-q" key={i}>
                  <label className="fld" htmlFor={`fg-cq-${i}`}>{q}</label>
                  <input
                    id={`fg-cq-${i}`}
                    type="text"
                    value={clarifyAs[i] || ""}
                    onChange={(e) => setClarifyAs((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                    placeholder="A few words is plenty…"
                    disabled={running}
                  />
                </div>
              ))}
              <div className="clarify-actions">
                <button className="btn primary" onClick={applyClarify} disabled={running || clarifyAs.every((a) => !a.trim())}>Add answers to the brief</button>
                <button className="btn ghost" onClick={() => { setClarifyQs([]); setClarifyAs([]); setClarifyNote(""); }} disabled={running}>Skip</button>
              </div>
            </div>
          )}
          {clarifyNote && <p className="note" style={{ marginTop: 6 }}>{clarifyNote}</p>}
        </div>
        {kind === "website" && (
          <div className="sitemode" style={{ marginTop: 14 }}>
            <div className="seg" role="group" aria-label="How the panel reviews the site" style={{ marginBottom: 0 }}>
              <button className={siteMode === "walk" ? "on" : ""} onClick={() => setSiteMode("walk")} disabled={running}>Send the panel through the site</button>
              <button className={siteMode === "react" ? "on" : ""} onClick={() => setSiteMode("react")} disabled={running}>React to a screenshot</button>
            </div>
            <p className="sub" style={{ marginTop: 8 }}>
              {siteMode === "walk"
                ? "Each persona-agent drives its own live browser through the site — clicking, scrolling, following links — then reports the path it took and its reaction. A small party goes through; live browsing is heavy."
                : "We screenshot the page (or you upload one) and the whole panel reacts to that single view."}
            </p>
          </div>
        )}

        {kind === "website" && siteMode === "walk" && (
          <div className="urlfetch" style={{ marginTop: 12 }}>
            <label className="fld" htmlFor="fg-walkurl">Site URL <span className="note" style={{ fontWeight: 400 }}>· where the panel starts</span></label>
            <input id="fg-walkurl" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" disabled={running} />
            <div className="walkctl">
              <span className="fld" style={{ margin: 0 }}>How many go through</span>
              <div className="segcount">
                <button onClick={() => setWalkers((w) => Math.max(WALK_MIN, w - 1))} disabled={running} aria-label="Fewer">−</button>
                <input type="number" min={WALK_MIN} max={WALK_MAX} value={walkers} onChange={(e) => setWalkers(Math.max(WALK_MIN, Math.min(WALK_MAX, Math.round(Number(e.target.value)) || WALK_MIN)))} disabled={running} />
                <button onClick={() => setWalkers((w) => Math.min(WALK_MAX, w + 1))} disabled={running} aria-label="More">+</button>
              </div>
              <span className="note">{walkers} persona-agent{walkers > 1 ? "s" : ""} · up to {WALK_STEPS} steps each · needs an API key</span>
            </div>
          </div>
        )}

        {kind === "website" && siteMode === "react" && images.length < 4 && (
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
        {def.images && !(kind === "website" && siteMode === "walk") && (
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
        {/* Live recipe — updates as the terms of the group change */}
        <div className="recipe" style={{ marginTop: 12, borderLeft: `4px solid ${industryAccent}` }}>
          <div className="recipe-lead">
            This is a <b>{plannedSize.toLocaleString()}-person {industryLabel.toLowerCase()}</b> panel
            {format ? <> reviewing {/^[aeiou]/i.test(format) ? "an" : "a"} <b>{format.toLowerCase()}</b></> : null} — across{" "}
            <b>{segments.length} segments</b>, each reacting individually and in character, not as an average.
            {plannedSize > LIVE_MAX && <> Live runs a representative {LIVE_MAX}; demo runs the whole panel.</>}
          </div>
          <div className="recipe-chips">
            <span className="rchip strong" style={{ background: industryAccent, borderColor: industryAccent }}>{def.label}</span>
            {format && <span className="rchip">{format}</span>}
            <span className="rchip">{industryLabel}</span>
            <span className="rchip">{plannedSize.toLocaleString()} agents</span>
            <span className="rchip">{segments.length} segments</span>
          </div>
        </div>

        {/* Live forecast — the room as a unit chart + what the run will take */}
        <div className="forecast" style={{ marginTop: 12 }}>
          <div className="fc-room">
            <div className="fc-h">The room · {plannedSize.toLocaleString()} agents</div>
            <div className="fc-dots">
              {dotsShown.map((c, i) => <span key={i} className="fc-dot" style={{ background: c }} />)}
              {dotsRest > 0 && <span className="fc-more">+{dotsRest.toLocaleString()}</span>}
            </div>
          </div>
          <div className="fc-stats">
            <div className="fc-stat"><div className="fc-n">{runCount.toLocaleString()}{isWalk ? "" : plannedSize > LIVE_MAX ? <span className="fc-sub"> of {plannedSize.toLocaleString()}</span> : null}</div><div className="fc-l">{isWalk ? "browse the site" : "run live"}</div></div>
            <div className="fc-stat"><div className="fc-n">{estLabel}</div><div className="fc-l">est. run time</div></div>
            <div className="fc-stat"><div className="fc-n">{isWalk ? `≤${walkCount * WALK_STEPS}` : runCount}</div><div className="fc-l">model calls</div></div>
            <div className="fc-stat"><div className={`fc-n ${balanceGap <= 30 ? "ok" : "warn"}`}>{balanceGap <= 30 ? "Balanced" : "Skewed"}</div><div className="fc-l">segment mix</div></div>
          </div>
        </div>

        {/* Panel health — defensibility read + one-tap rebalance */}
        <div className="panelhealth" style={{ marginTop: 12 }}>
          <div className="ph-left">
            <div className="ph-h">Panel health</div>
            <div className={`ph-meter ${healthScore >= 1 ? "hi" : healthScore >= 0.66 ? "mid" : "lo"}`}><span style={{ width: `${Math.round(healthScore * 100)}%` }} /></div>
          </div>
          <div className="ph-msg">{healthMsg}</div>
          <button className="btn ghost ph-btn" onClick={balanceToIndustry} disabled={running}>Balance to industry</button>
        </div>

        {/* One live card per segment — adjusts as the user changes the group */}
        <div className="panelcards" style={{ marginTop: 14 }}>
          {segments.map((s) => {
            const pct = Math.round((s.count / (plannedSize || 1)) * 100);
            const color = segColor(s.id);
            return (
              <div className="pseg" key={s.id}>
                <div className="pseg-top">
                  <span className="pseg-av" style={{ background: color }}>{monogram(s.name || "?")}</span>
                  <div className="pseg-id">
                    <input className="pseg-name" value={s.name} onChange={(e) => renameSeg(s.id, e.target.value)} disabled={running} aria-label="Segment name" />
                    <div className="pseg-how">{s.how}</div>
                  </div>
                  <button className="pseg-x" onClick={() => removeSeg(s.id)} disabled={running || segments.length <= 1} aria-label="Remove segment">×</button>
                </div>
                <div className="pseg-bar"><span style={{ width: `${pct}%`, background: color }} /></div>
                <div className="pseg-foot">
                  <div className="segcount">
                    <button onClick={() => setCount(s.id, s.count - 1)} disabled={running} aria-label="Fewer">−</button>
                    <input type="number" min={0} value={s.count} onChange={(e) => setCount(s.id, Number(e.target.value))} disabled={running} />
                    <button onClick={() => setCount(s.id, s.count + 1)} disabled={running} aria-label="More">+</button>
                  </div>
                  <span className="pseg-pct"><b>{pct}%</b> of the room · {s.count} {s.count === 1 ? "agent" : "agents"}</span>
                </div>
              </div>
            );
          })}
          <button className="pseg-add" onClick={addSeg} disabled={running}>
            <span className="pseg-add-i">＋</span>
            Add a segment
          </button>
        </div>

        {/* Live "convening" — each agent lights up as it reacts */}
        {running && roster.length > 0 && (
          <div className="convening" style={{ marginTop: 16 }}>
            <div className="conv-h">
              <span className="conv-pulse" /> The room is convening — <b>{done}</b> of {roster.length} have reacted
            </div>
            <div className="conv-grid">
              {roster.map((p) => {
                const s = filled[p.id];
                return (
                  <span key={p.id} className={`conv-dot ${s ? "in" : "wait"}`} style={s ? { background: SENT_DOT[s], borderColor: SENT_DOT[s] } : undefined} title={s ? p.name : `${p.name} — reacting…`}>
                    {monogram(p.name)}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="runbar" style={{ marginTop: 16 }}>
          {isWalk ? (
            <>
              <button className="btn primary" onClick={runWalk} disabled={running || !url.trim()}>
                {running ? `Walking the site… ${done}/${walkCount}` : "Send the panel through the site"}
              </button>
              <button className="btn ghost" onClick={runWalkDemo} disabled={running}>Load demo</button>
              {running && <div className="progress"><div style={{ width: `${walkCount ? (done / walkCount) * 100 : 0}%` }} /></div>}
              <span className="note">
                {running ? `${done}/${walkCount} browsing…` : `${walkCount} persona-agents browse live · a few min · demo is instant & free`}
              </span>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={runLive} disabled={running || !body.trim()}>
                {running ? `Convening… ${done}/${liveSize}` : "Convene the focus group"}
              </button>
              <button className="btn ghost" onClick={runDemo} disabled={running}>Load demo</button>
              {running && <div className="progress"><div style={{ width: `${liveSize ? (done / liveSize) * 100 : 0}%` }} /></div>}
              <span className="note">
                {running ? `${done}/${liveSize} reacting…` : `${plannedSize > LIVE_MAX ? `${LIVE_MAX} live · ` : ""}~1–2 min · demo is instant & free`}
              </span>
            </>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}
