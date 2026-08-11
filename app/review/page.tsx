"use client";

import { useState } from "react";

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

const SCORE_LABELS: Record<string, string> = {
  hierarchy: "Visual hierarchy",
  clarity_of_ask: "Clarity of the ask",
  cta_and_gift_array: "CTA & gift array",
  trust_and_credibility: "Trust & credibility",
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

  async function submit(body: { url?: string; image?: string }) {
    setBusy(true);
    setError(null);
    setReview(null);
    setShot(null);
    try {
      const resp = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setReview(data.review);
      setShot(data.screenshot);
      setModel(data.model);
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
          Paste a live donation or campaign page URL — the app captures a screenshot and Claude
          returns an expert UI/UX review: hierarchy, the ask, gift array and CTA, trust cues, and
          accessibility, with prioritized fixes.
        </p>
        <div className="runbar">
          <input
            type="text"
            placeholder="https://example.org/donate"
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
          <label className="linklike">
            Upload a screenshot instead
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
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
          </label>
          .
        </p>
        {error && <p className="error">{error}</p>}
      </section>

      {review && (
        <>
          <section className="card">
            <p className="sub" style={{ marginBottom: 12 }}>{review.summary}</p>
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
            <p className="caveat" style={{ marginTop: 16, marginBottom: 0 }}>
              One model&apos;s expert read of a single screenshot{model ? ` (${model})` : ""} — a
              design crit to act on, not a usability test. Validate high-stakes changes with real
              users.
            </p>
          </section>

          {review.strengths?.length > 0 && (
            <section className="card">
              <h2>What&apos;s working</h2>
              <ul className="revlist">
                {review.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Prioritized fixes</h2>
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
          </section>

          {shot && (
            <section className="card">
              <h2>What was reviewed</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot} alt="Captured page" className="reviewshot" />
            </section>
          )}
        </>
      )}
    </>
  );
}
