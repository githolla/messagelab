"use client";

import { useState } from "react";
import type { IntentChoice, PersonaResult } from "@/lib/types";
import { INTENT_ORDER, segmentLabel } from "@/lib/types";

const A = "var(--series-a)";
const B = "var(--series-b)";
const NEUTRAL = "var(--neutral-bar)";

function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const show = (e: React.MouseEvent, text: string) =>
    setTip({ x: e.clientX + 12, y: e.clientY + 12, text });
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { show, hide, node };
}

export function Legend({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <div className="legend">
      <span>
        <span className="sw" style={{ background: A }} />
        Version A — {labelA}
      </span>
      <span>
        <span className="sw" style={{ background: B }} />
        Version B — {labelB}
      </span>
    </div>
  );
}

/** Horizontal bar: winner votes. Bars colored by the entity they represent. */
export function WinnerChart({ results }: { results: PersonaResult[] }) {
  const t = useTooltip();
  const rows = [
    { key: "send_a", label: "Send Version A", color: A },
    { key: "send_b", label: "Send Version B", color: B },
    { key: "either", label: "Either works", color: NEUTRAL },
    { key: "neither", label: "Neither works", color: NEUTRAL },
  ] as const;
  const counts = rows.map((r) => results.filter((x) => x.winner === r.key).length);
  const max = Math.max(...counts, 1);
  const W = 640, LBL = 150, BAR = 18, GAP = 10;
  const H = rows.length * (BAR + GAP);

  return (
    <figure className="chart">
      <figcaption>
        Which version should be sent? <span className="capsub">one vote per persona</span>
      </figcaption>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Winner votes">
        {rows.map((r, i) => {
          const w = (counts[i] / max) * (W - LBL - 60);
          const y = i * (BAR + GAP);
          return (
            <g key={r.key}>
              <text x={LBL - 8} y={y + BAR / 2 + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">
                {r.label}
              </text>
              <rect
                x={LBL} y={y} width={Math.max(w, 2)} height={BAR} rx="4" fill={r.color}
                onMouseMove={(e) => t.show(e, `${r.label}: ${counts[i]} of ${results.length} personas`)}
                onMouseLeave={t.hide}
              />
              <text x={LBL + Math.max(w, 2) + 8} y={y + BAR / 2 + 4} fontSize="12" fill="var(--ink)" fontWeight="600">
                {counts[i]}
              </text>
            </g>
          );
        })}
      </svg>
      {t.node}
    </figure>
  );
}

/** Grouped bars: intent distribution, series = variant. Labels vary by asset type. */
export function IntentChart({
  results,
  labels,
}: {
  results: PersonaResult[];
  labels: Record<IntentChoice, string>;
}) {
  const t = useTooltip();
  const countsA = INTENT_ORDER.map((k) => results.filter((r) => r.intentA === k).length);
  const countsB = INTENT_ORDER.map((k) => results.filter((r) => r.intentB === k).length);
  const max = Math.max(...countsA, ...countsB, 1);
  const W = 640, H = 170, PAD = 26, PLOT_H = 120;
  const groupW = (W - PAD * 2) / INTENT_ORDER.length;
  const barW = 16, gap = 2;

  return (
    <figure className="chart">
      <figcaption>
        What would each persona do? <span className="capsub">response intent per variant</span>
      </figcaption>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Intent distribution">
        <line x1={PAD} y1={PLOT_H} x2={W - PAD} y2={PLOT_H} stroke="var(--line)" />
        {INTENT_ORDER.map((k, i) => {
          const cx = PAD + i * groupW + groupW / 2;
          const hA = (countsA[i] / max) * (PLOT_H - 14);
          const hB = (countsB[i] / max) * (PLOT_H - 14);
          return (
            <g key={k}>
              <rect
                x={cx - barW - gap / 2} y={PLOT_H - hA} width={barW} height={Math.max(hA, 2)} rx="4" fill={A}
                onMouseMove={(e) => t.show(e, `Version A · ${labels[k]}: ${countsA[i]}`)}
                onMouseLeave={t.hide}
              />
              <rect
                x={cx + gap / 2} y={PLOT_H - hB} width={barW} height={Math.max(hB, 2)} rx="4" fill={B}
                onMouseMove={(e) => t.show(e, `Version B · ${labels[k]}: ${countsB[i]}`)}
                onMouseLeave={t.hide}
              />
              {countsA[i] > 0 && (
                <text x={cx - barW / 2 - gap / 2} y={PLOT_H - hA - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={A}>{countsA[i]}</text>
              )}
              {countsB[i] > 0 && (
                <text x={cx + barW / 2 + gap / 2} y={PLOT_H - hB - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={B}>{countsB[i]}</text>
              )}
              {labels[k].split(", ").map((line, li) => (
                <text key={li} x={cx} y={PLOT_H + 16 + li * 13} textAnchor="middle" fontSize="10.5" fill="var(--ink-2)">
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      {t.node}
    </figure>
  );
}

/** Dot plot: average resonance by giving segment, two series. */
export function ResonanceChart({ results }: { results: PersonaResult[] }) {
  const t = useTooltip();
  const segs = results.reduce<string[]>((acc, r) => {
    if (!acc.includes(r.giving)) acc.push(r.giving);
    return acc;
  }, []);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const W = 640, LBL = 150, ROW = 42, PADR = 40;
  const H = segs.length * ROW + 26;
  const x = (v: number) => LBL + ((v - 1) / 4) * (W - LBL - PADR);

  return (
    <figure className="chart">
      <figcaption>
        Emotional resonance by segment <span className="capsub">mean rating, 1–5 · higher is stronger</span>
      </figcaption>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resonance by segment">
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={x(v)} y1={0} x2={x(v)} y2={H - 22} stroke="var(--line)" />
            <text x={x(v)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{v}</text>
          </g>
        ))}
        {segs.map((g, i) => {
          const rs = results.filter((r) => r.giving === g);
          const mA = avg(rs.map((r) => r.resonanceA));
          const mB = avg(rs.map((r) => r.resonanceB));
          const y = i * ROW + ROW / 2;
          return (
            <g key={g}>
              <text x={LBL - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">{segmentLabel(g)}</text>
              <line x1={x(Math.min(mA, mB))} y1={y} x2={x(Math.max(mA, mB))} y2={y} stroke="var(--line)" strokeWidth="2" />
              <circle
                cx={x(mA)} cy={y} r="6" fill={A} stroke="var(--card)" strokeWidth="2"
                onMouseMove={(e) => t.show(e, `Version A · ${segmentLabel(g)}: ${mA.toFixed(1)} (n=${rs.length})`)}
                onMouseLeave={t.hide}
              />
              <circle
                cx={x(mB)} cy={y} r="6" fill={B} stroke="var(--card)" strokeWidth="2"
                onMouseMove={(e) => t.show(e, `Version B · ${segmentLabel(g)}: ${mB.toFixed(1)} (n=${rs.length})`)}
                onMouseLeave={t.hide}
              />
              {/* Inline value labels so the numbers are readable without hovering — A above, B below. */}
              <text x={x(mA)} y={y - 11} textAnchor="middle" fontSize="11" fontWeight="700" fill={A}>{mA.toFixed(1)}</text>
              <text x={x(mB)} y={y + 18} textAnchor="middle" fontSize="11" fontWeight="700" fill={B}>{mB.toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
      {t.node}
    </figure>
  );
}
