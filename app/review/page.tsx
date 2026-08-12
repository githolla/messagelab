"use client";

import { useRef, useState } from "react";
import { INDUSTRIES } from "@/lib/industries";

interface ReviewIssue {
  severity: "high" | "medium" | "low";
  area: string;
  finding: string;
  fix: string;
}
interface Review {
  summary: string;
  scores: Record<string, number>;
  strengths: string[];
  issues: ReviewIssue[];
}

type ReviewTab = "fixes" | "strengths" | "screenshot";

const SCORE_LABELS: Record<string, string> = {
  hierarchy: "Visual hierarchy",
  clarity: "Clarity & content",
  navigation: "Navigation & IA",
  cta: "Primary action / CTA",
  trust: "Trust & credibility",
  accessibility: "Accessibility",
};

// Downscale an uploaded screenshot before sending (matches the A/B flow).
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
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Could not read that image file."));
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function ReviewPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [industry, setIndustry] = useState("general");
  const [context, setContext] = useState("");
  const [reviewedFor, setReviewedFor] = useState<string | null>(null);
  const [rtab, setRtab] = useState<ReviewTab>("fixes");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(body: { url?: string; image?: string }) {
    setBusy(true);
    setError(null);
    setReview(null);
    setShot(null);
    setRtab("fixes");
    try {
      const resp = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, industry, context }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setReview(data.review);
      setShot(data.screenshot);
      setModel(data.model);
      setReviewedFor(data.industry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Review a page</h2>
        <p className="sub">
          Paste any web page URL — the app captures a screenshot and Claude returns an expert UI/UX
          and usability review: visual hierarchy, clarity, navigation, the primary call-to-action,
          trust cues, and accessibility, with prioritized fixes.
        </p>
        <div className="grid2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fld" htmlFor="rev-industry">Industry</label>
            <select
              id="rev-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={busy}
            >
              {INDUSTRIES.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="fld" htmlFor="rev-context">Context (optional)</label>
            <input
              id="rev-context"
              type="text"
              placeholder="Audience, page goal, brand voice…"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={busy}
              maxLength={600}
            />
          </div>
        </div>
        <label className="fld" htmlFor="rev-url">Page URL</label>
        <div className="runbar">
          <input
            id="rev-url"
            type="text"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && submit({ url: url.trim() })}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button
            className="btn primary"
            onClick={() => submit({ url: url.trim() })}
            disabled={busy || !url.trim()}
          >
            {busy ? "Reviewing…" : "Review page"}
          </button>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Site blocks headless browsers or needs a login?{" "}
          <button
            type="button"
            className="linklike"
            style={{ background: "none", border: 0, font: "inherit", padding: 0 }}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Upload a screenshot instead
          </button>
          .
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            // Visually hidden but kept in the tab order via the button above.
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                submit({ image: await fileToDataUrl(file) });
              } catch {
                setError("Could not read that image file.");
              }
            }}
          />
        </p>
        {error && <p className="error">{error}</p>}
      </section>

      {review && (
        <>
          {/* Hero: lens + summary + scores, always visible */}
          <section className="card">
            {reviewedFor && reviewedFor !== "General / other" && (
              <div className="lens">Reviewed through a {reviewedFor} lens</div>
            )}
            <p className="sub" style={{ marginBottom: 14 }}>{review.summary}</p>
            <div className="scorerow">
              {Object.entries(review.scores).map(([k, v]) => (
                <div className="score" key={k}>
                  <div className="v">
                    {v}
                    <span className="of">/5</span>
                  </div>
                  <div className="k">{SCORE_LABELS[k] ?? k}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Tabbed detail — no more one long scroll */}
          <section className="card">
            <div className="tabs">
              {([
                ["fixes", `Fixes${review.issues?.length ? ` (${review.issues.length})` : ""}`],
                ["strengths", `Strengths${review.strengths?.length ? ` (${review.strengths.length})` : ""}`],
                ["screenshot", "Screenshot"],
              ] as [ReviewTab, string][]).map(([k, lbl]) => (
                <button key={k} className={rtab === k ? "on" : ""} aria-pressed={rtab === k} onClick={() => setRtab(k)}>
                  {lbl}
                </button>
              ))}
            </div>

            {rtab === "fixes" && (
              <div className="tabbody">
                {review.issues.map((iss, i) => (
                  <div className="issue" key={i}>
                    <div className="ihead">
                      <span className={`sev ${iss.severity}`}>{iss.severity}</span>
                      <span className="area">{iss.area}</span>
                    </div>
                    <div className="finding">{iss.finding}</div>
                    <div className="fix">
                      <strong>Fix:</strong> {iss.fix}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rtab === "strengths" && (
              <div className="tabbody">
                {review.strengths?.length ? (
                  <ul className="revlist">
                    {review.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="note">No standout strengths were called out.</p>
                )}
              </div>
            )}

            {rtab === "screenshot" && (
              <div className="tabbody">
                {shot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shot} alt="Captured page" className="reviewshot" />
                ) : (
                  <p className="note">No screenshot was captured.</p>
                )}
              </div>
            )}
          </section>

          <p className="caveat">
            One model&apos;s expert read of a single screenshot{model ? ` (${model})` : ""} — a
            design crit to act on, not a usability test. Validate high-stakes changes with real
            users.
          </p>
        </>
      )}
    </>
  );
}
