import type { PersonaResult, Variants } from "./types";
import { tally, GIVE_INTENTS } from "./refine";
import { ANALYSTS } from "./archetypes";

export type Verdict = "ship_a" | "ship_b" | "rework" | "tie";

export interface Analysis {
  verdict: Verdict;
  headline: string;
  summary: string;
  /** The reasons behind the verdict, most important first — each a claim + the evidence for it. */
  keyPoints?: { point: string; why: string }[];
  segments: { segment: string; driver: string; barrier: string; divergence: string }[];
  actions: { priority: "high" | "medium" | "low"; action: string }[];
  analysts: { key: string; read: string }[];
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  ship_a: "Ship Version A",
  ship_b: "Ship Version B",
  rework: "Rework both",
  tie: "Too close to call",
};

function uniqueSegments(results: PersonaResult[]): string[] {
  const seen: string[] = [];
  for (const r of results) if (!seen.includes(r.giving)) seen.push(r.giving);
  return seen;
}

// Deterministic analysis for demo mode — data-aware, no API calls, no Math.random.
export function demoAnalysis(variants: Variants, results: PersonaResult[]): Analysis {
  const t = tally(results);
  const n = results.length;
  const winLabel = t.givesA === t.givesB ? null : t.givesA > t.givesB ? "A" : "B";
  const gap = Math.abs(t.givesA - t.givesB);
  const strong = gap >= Math.max(2, Math.round(n * 0.12));
  const verdict: Verdict =
    t.neither > n * 0.35
      ? "rework"
      : winLabel === null || !strong
        ? "tie"
        : winLabel === "A"
          ? "ship_a"
          : "ship_b";

  const label = (s: "A" | "B") => (s === "A" ? variants.labelA : variants.labelB);
  const headline =
    verdict === "rework"
      ? `Both versions leave most of the panel cold — ${t.neither} of ${n} rejected both.`
      : verdict === "tie"
        ? `A and B convert about equally (${t.givesA} vs ${t.givesB}) — no clear winner yet.`
        : `${label(winLabel as "A" | "B")} converts more of the panel (${Math.max(
            t.givesA,
            t.givesB
          )} vs ${Math.min(t.givesA, t.givesB)}).`;

  const segments = uniqueSegments(results).map((g) => {
    const rs = results.filter((r) => r.giving === g);
    const convA = rs.filter((r) => GIVE_INTENTS.includes(r.intentA)).length;
    const convB = rs.filter((r) => GIVE_INTENTS.includes(r.intentB)).length;
    const lean = convA === convB ? "split evenly" : convA > convB ? "leaned to A" : "leaned to B";
    return {
      segment: g,
      driver: `${convA + convB > rs.length ? "Responsive" : "Harder to move"} — ${lean} on intent to act.`,
      barrier:
        rs.filter((r) => r.winner === "neither").length > 0
          ? "Some rejected both versions outright."
          : "Wants a clearer, more specific reason to act.",
      divergence: `Would-convert A ${convA} / B ${convB} (n=${rs.length}).`,
    };
  });

  const actions: Analysis["actions"] = [
    {
      priority: "high",
      action:
        verdict === "rework"
          ? "Rework the core offer — the current framing isn't landing with most of the panel."
          : `Lead with what made ${label((winLabel ?? "A") as "A" | "B")} win and cut the weaker version's flat opening.`,
    },
    { priority: "high", action: "Make the primary call-to-action more specific and concrete." },
    { priority: "medium", action: "Add proof or specificity for the skeptical segments." },
    { priority: "low", action: "Tighten length — several reactions mention skimming." },
  ];

  const winner = winLabel ? label(winLabel as "A" | "B") : null;
  const keyPoints: NonNullable<Analysis["keyPoints"]> = [
    verdict === "rework"
      ? { point: "Neither version is landing yet", why: `${t.neither} of ${n} personas would act on neither — the offer or framing needs rework before another test.` }
      : verdict === "tie"
        ? { point: "No clear winner yet", why: `A and B convert about equally (${t.givesA} vs ${t.givesB}); the difference is within noise at n=${n}.` }
        : { point: `${winner} converts more of the panel`, why: `${Math.max(t.givesA, t.givesB)} of ${n} personas would act on ${winner}, vs ${Math.min(t.givesA, t.givesB)} on the other version.` },
    strong
      ? { point: "The gap looks meaningful", why: "The margin shows up across segments, not just one archetype — worth acting on." }
      : { point: "Treat the gap as directional", why: `At n=${n} the margin is small; a confidence interval would overlap, so read it as a signal, not proof.` },
    { point: "Skeptical segments want proof", why: "Archetypes that hunt for evidence held back until they saw specifics — add a concrete proof point before the ask." },
    { point: "Concrete beats abstract", why: "In the reaction rationales, specific lines (numbers, names, a clear next step) moved more personas than general framing." },
    { point: "The call-to-action can be sharper", why: "Several reactions mention skimming or vagueness — one specific next step would lift intent to act." },
  ];

  const analysts = ANALYSTS.map((a) => ({
    key: a.key,
    read:
      a.key === "conversion"
        ? `Winner drew ${Math.max(t.givesA, t.givesB)}/${n} would-convert; the gap is ${
            strong ? "meaningful" : "within noise"
          } at this panel size.`
        : a.key === "trust"
          ? "Skeptical archetypes wanted more proof before acting — add credibility cues."
          : a.key === "accessibility"
            ? "Nothing here tests real contrast or targets — run a live page review for that."
            : a.key === "copy"
              ? "Concrete, specific lines outperformed abstract framing in the rationales."
              : "Emotional resonance split by segment — one voice won't fit every archetype.",
  }));

  const summary =
    verdict === "rework"
      ? "Most of the panel would act on neither version — rework the core offer before testing again."
      : verdict === "tie"
        ? "The two versions pull about the same share of the panel; decide on other factors, or refine and re-test."
        : `${winner} pulled ahead on intent to act${strong ? "" : ", though the margin is small at this panel size"}. The key points below explain why.`;
  return { verdict, headline, summary, keyPoints, segments, actions, analysts };
}
