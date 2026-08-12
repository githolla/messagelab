// Deterministic demo / fallback. Ported in spirit from Message Lab's lib/demo.ts
// + demoAnalysis. When a live run can't happen (no credits, network down) or the
// analysis call fails, the engine falls back to these so the feature still
// renders a complete, plausible report instead of an error screen. Fully
// deterministic — no Math.random, no API calls. Everything it returns is marked
// demo:true so it can never be mistaken for a real simulation.

import { ANALYSTS, tally } from "./analyze.js";

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const INTENTS = ["dismiss", "read_no_reply", "save_for_later", "reply_low", "reply_clear", "reply_hot"];
const REPLY = new Set(["reply_low", "reply_clear", "reply_hot"]);

/** A deterministic, in-distribution reaction for one persona. B gets a mild edge. */
export function demoReaction(persona, variants) {
  const h = fnv(persona.id);
  const a = h % 6;
  const b = Math.min(5, ((h >> 3) % 6) + ((h >> 6) % 2)); // slight upward nudge for B
  const intentA = INTENTS[a];
  const intentB = INTENTS[b];
  const winner =
    REPLY.has(intentB) && b > a ? "send_b" : REPLY.has(intentA) && a > b ? "send_a" : b === a ? "either" : b > a ? "send_b" : "send_a";
  return {
    personaId: persona.id,
    personaName: persona.name,
    segment: persona.segment,
    intentA,
    intentB,
    resonanceA: 1 + (a % 5),
    resonanceB: 1 + (b % 5),
    trust: b > a ? "version_b" : a > b ? "version_a" : "both_equal",
    winner,
    rationale: `As a ${persona.segment}, version ${b >= a ? "B" : "A"} matched what I care about more directly. (Demo reaction — no API call.)`,
    baselineIntent: 2 + (h % 4),
    demo: true,
  };
}

/** A full demo panel: one deterministic reaction per persona. */
export function demoResults(panel, variants) {
  return panel.map((p) => demoReaction(p, variants));
}

function uniqueSegments(results) {
  const seen = [];
  for (const r of results) if (!seen.includes(r.segment)) seen.push(r.segment);
  return seen;
}

/**
 * A deterministic, data-aware report computed from the reactions — no API call.
 * Mirrors the shape of a live analysis so the UI renders identically.
 */
export function demoAnalysis(variants, results) {
  const t = tally(results);
  const n = results.length;
  const gap = t.repliesB - t.repliesA;
  const strong = Math.abs(gap) >= Math.max(2, Math.round(n * 0.12));
  const verdict = t.neither > n * 0.35 ? "rework" : !strong ? "tie" : gap > 0 ? "ship_b" : "ship_a";
  const winLabel = verdict === "ship_b" ? variants.labelB : verdict === "ship_a" ? variants.labelA : null;

  const headline =
    verdict === "rework"
      ? "Neither version lands — a lot of the panel would ignore both."
      : verdict === "tie"
        ? "Too close to call — both versions pull a similar share of replies."
        : `"${winLabel}" wins on reply intent (${Math.max(t.repliesA, t.repliesB)} vs ${Math.min(t.repliesA, t.repliesB)} of ${n}).`;

  const segments = uniqueSegments(results).map((seg) => {
    const rs = results.filter((r) => r.segment === seg);
    const rA = rs.filter((r) => ["reply_low", "reply_clear", "reply_hot"].includes(r.intentA)).length;
    const rB = rs.filter((r) => ["reply_low", "reply_clear", "reply_hot"].includes(r.intentB)).length;
    return {
      segment: seg,
      driver: rB >= rA ? "responded more to the specifics in B" : "responded more to the tone in A",
      barrier: "some in this group would still not reply at all",
      divergence: `would-reply A ${rA} / B ${rB} (n=${rs.length})`,
    };
  });

  const actions = [
    { priority: "high", action: `Lead with what drove the ${verdict === "ship_a" ? "A" : "B"} win — put it in the first line.` },
    { priority: "medium", action: "Add one concrete specific (price, timeline, or proof) for the skeptical segment." },
    { priority: "low", action: "Tighten the opening; the busy skimmer segment bails on long replies." },
  ];

  const analysts = ANALYSTS.map((a) => ({
    key: a.key,
    read: `${a.label}: ${verdict === "tie" ? "no clear separation in the demo data" : `${winLabel} reads stronger on ${a.lens.split(",")[0]}`}.`,
  }));

  return { verdict, headline, summary: `${headline} This is a demo/estimated report generated without an API call — run live for a real simulation.`, segments, actions, analysts };
}
