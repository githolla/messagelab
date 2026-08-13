import { describe, it, expect } from "vitest";
import { wilson, shareWithCI } from "../lib/stats";
import { wordDiff } from "../lib/diff";
import { tally, GIVE_INTENTS } from "../lib/refine";
import { messageAudienceKey } from "../lib/archetypes";
import { demoResult } from "../lib/demo";
import type { Persona, PersonaResult } from "../lib/types";
import {
  SAMPLE_LEADS,
  engagementScore,
  recommendedNextStep,
  buildLeadCohort,
  tierOf,
  type Lead,
} from "../lib/leads";
import { recommend, simulateStrategy, ACTIONS } from "../lib/leadsim";

describe("wilson", () => {
  it("returns [0,0] at n=0", () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 0 });
  });
  it("has low=0 when k=0 and high=1 when k=n", () => {
    expect(wilson(0, 10).low).toBe(0);
    expect(wilson(10, 10).high).toBe(1);
  });
  it("brackets the point estimate and stays in [0,1]", () => {
    const w = wilson(6, 24);
    expect(w.low).toBeGreaterThanOrEqual(0);
    expect(w.high).toBeLessThanOrEqual(1);
    expect(w.low).toBeLessThan(6 / 24);
    expect(w.high).toBeGreaterThan(6 / 24);
  });
  it("tightens as n grows", () => {
    const narrow = wilson(50, 100);
    const wide = wilson(5, 10);
    expect(narrow.high - narrow.low).toBeLessThan(wide.high - wide.low);
  });
  it("shareWithCI formats a percentage band", () => {
    expect(shareWithCI(0, 0)).toBe("—");
    expect(shareWithCI(12, 24)).toMatch(/^50% · 95% CI \d+–\d+%$/);
  });
});

describe("wordDiff", () => {
  it("marks identical text entirely as same", () => {
    const segs = wordDiff("hello world", "hello world");
    expect(segs.every((s) => s.type === "same")).toBe(true);
    expect(segs.map((s) => s.text).join("")).toBe("hello world");
  });
  it("detects an insertion", () => {
    const segs = wordDiff("hello world", "hello brave world");
    expect(segs.some((s) => s.type === "add" && s.text.includes("brave"))).toBe(true);
    expect(segs.some((s) => s.type === "del")).toBe(false);
  });
  it("detects a deletion", () => {
    const segs = wordDiff("hello brave world", "hello world");
    expect(segs.some((s) => s.type === "del" && s.text.includes("brave"))).toBe(true);
  });
  it("detects a replacement", () => {
    const segs = wordDiff("the quick fox", "the slow fox");
    expect(segs.some((s) => s.type === "del" && s.text.includes("quick"))).toBe(true);
    expect(segs.some((s) => s.type === "add" && s.text.includes("slow"))).toBe(true);
  });
  it("reconstructs both sides from the segments", () => {
    const before = "a b c d";
    const after = "a x c e";
    const segs = wordDiff(before, after);
    const rebuiltBefore = segs.filter((s) => s.type !== "add").map((s) => s.text).join("");
    const rebuiltAfter = segs.filter((s) => s.type !== "del").map((s) => s.text).join("");
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });
});

function res(partial: Partial<PersonaResult>): PersonaResult {
  return {
    personaId: "x",
    personaName: "x",
    giving: "Skimmer",
    intentA: "dismiss",
    intentB: "dismiss",
    resonanceA: 3,
    resonanceB: 3,
    trust: "neither",
    winner: "either",
    rationale: "",
    baselineIntent: 3,
    ...partial,
  };
}

describe("tally", () => {
  it("counts give intents and winners", () => {
    const t = tally([
      res({ winner: "send_a", intentA: "give_small", intentB: "dismiss" }),
      res({ winner: "send_b", intentA: "dismiss", intentB: "give_more" }),
      res({ winner: "neither", intentA: "dismiss", intentB: "dismiss" }),
      res({ winner: "send_a", intentA: "give_suggested", intentB: "engage_no_gift" }),
    ]);
    expect(t.votesA).toBe(2);
    expect(t.votesB).toBe(1);
    expect(t.givesA).toBe(2);
    expect(t.givesB).toBe(1);
    expect(t.neither).toBe(1);
  });
  it("GIVE_INTENTS are exactly the three give tiers", () => {
    expect(GIVE_INTENTS).toEqual(["give_small", "give_suggested", "give_more"]);
  });
});

describe("messageAudienceKey", () => {
  const rows: [string, string | null][] = [
    ["Welcome / onboarding", "new"],
    ["New-patient welcome", "new"],
    ["Re-engagement / win-back", "lapsed"],
    ["Abandoned cart", "hesitating"],
    ["Renewal reminder", "renewing"],
    ["Upsell / cross-sell", "upsell"],
    ["Application follow-up", "warm"],
    ["Referral ask", "advocate"],
    ["Loyalty / VIP reward", "loyal"],
    ["Promotional offer", null],
    ["Newsletter", null],
  ];
  for (const [input, expected] of rows) {
    it(`maps "${input}" → ${expected}`, () => {
      expect(messageAudienceKey(input)).toBe(expected);
    });
  }
  it("returns null for undefined", () => {
    expect(messageAudienceKey(undefined)).toBe(null);
  });
});

describe("demoResult", () => {
  const archetypes = [
    "Skimmer", "Skeptic", "Ready Buyer", "Comparison Shopper", "Mobile User",
    "Bargain Hunter", "Brand Loyalist", "First-time Visitor", "Yield Seeker", "Cautious Saver",
    "Deal Seeker", "Loyal Fan",
  ];
  function panel(leanKey: string): PersonaResult[] {
    const out: PersonaResult[] = [];
    for (const a of archetypes) {
      for (let i = 0; i < 3; i++) {
        const p: Persona = {
          id: `demo:${a}:${i}`,
          name: `${a} #${i}`,
          giving: a,
          age: null,
          dimensions: { archetype: a },
        };
        out.push(demoResult(p, 0.5, leanKey));
      }
    }
    return out;
  }

  it("is deterministic for the same inputs", () => {
    const a = demoResult({ id: "d:1", name: "n", giving: "Skimmer", age: null, dimensions: {} }, 0.5, "k");
    const b = demoResult({ id: "d:1", name: "n", giving: "Skimmer", age: null, dimensions: {} }, 0.5, "k");
    expect(a).toEqual(b);
  });

  it("does NOT systematically favor Version A across a mixed panel", () => {
    const p = panel("copyA|copyB");
    const aWins = p.filter((r) => r.winner === "send_a").length;
    const bWins = p.filter((r) => r.winner === "send_b").length;
    // Both directions must appear, and neither side may dominate the other by a
    // large margin (the old demo gave A a fixed +0.02 on every archetype).
    expect(aWins).toBeGreaterThan(0);
    expect(bWins).toBeGreaterThan(0);
    expect(Math.abs(aWins - bWins)).toBeLessThan(p.length * 0.5);
  });

  it("swings differently for different copy (lean depends on the copy seed)", () => {
    const one = panel("x1").map((r) => r.winner).join(",");
    const two = panel("totally different copy").map((r) => r.winner).join(",");
    expect(one).not.toBe(two);
  });

  it("mean A/B scores are balanced, not A-biased", () => {
    const p = panel("copyA|copyB");
    const meanResA = p.reduce((s, r) => s + r.resonanceA, 0) / p.length;
    const meanResB = p.reduce((s, r) => s + r.resonanceB, 0) / p.length;
    expect(Math.abs(meanResA - meanResB)).toBeLessThan(0.6);
  });
});

describe("lead audience simulation", () => {
  const lead = (over: Partial<Lead>): Lead => ({
    id: "t",
    name: "Test Lead",
    title: "Director",
    seniority: "Director",
    company: "Acme",
    targetAccount: false,
    relationship: "none",
    attended: true,
    pctAttended: 80,
    stayedToEnd: true,
    questionsAsked: 1,
    surveyCompleted: true,
    resourcesDownloaded: 1,
    priorWebinars: 1,
    topicSignal: "retention",
    ...over,
  });

  it("recommend() is deterministic for the same lead", () => {
    const a = recommend(SAMPLE_LEADS[0]);
    const b = recommend(SAMPLE_LEADS[0]);
    expect(a.winner.id).toBe(b.winner.id);
    expect(a.margin).toBe(b.margin);
    expect(a.results.map((r) => r.score)).toEqual(b.results.map((r) => r.score));
  });

  it("simulateStrategy assigns every cohort member exactly one action", () => {
    const cohort = buildLeadCohort(SAMPLE_LEADS[0], 16);
    const res = simulateStrategy(cohort, "insight");
    const total = [...ACTIONS, "unsubscribe" as const].reduce((s, a) => s + res.actionCounts[a], 0);
    expect(total).toBe(16);
    expect(res.n).toBe(16);
  });

  it("recommends waiting for a cold, no-signal attendee", () => {
    const cold = lead({ pctAttended: 22, stayedToEnd: false, questionsAsked: 0, surveyCompleted: false, resourcesDownloaded: 0, priorWebinars: 0 });
    expect(recommend(cold).winner.id).toBe("wait");
    expect(recommendedNextStep(cold).id).toBe("wait");
  });

  it("prefers an engagement-first approach over an immediate meeting for a hot but cold-relationship lead", () => {
    const hotCold = lead({ pctAttended: 95, stayedToEnd: true, questionsAsked: 3, surveyCompleted: true, resourcesDownloaded: 2, relationship: "none" });
    const rec = recommend(hotCold);
    expect(["insight", "conversation", "resource"]).toContain(rec.winner.id);
    expect(rec.winner.id).not.toBe("meeting");
  });

  it("engagement score is higher for a strong attendee than a no-show", () => {
    const strong = lead({ pctAttended: 100, stayedToEnd: true, questionsAsked: 4, surveyCompleted: true, resourcesDownloaded: 3 });
    const noShow = lead({ attended: false, pctAttended: 0, stayedToEnd: false, questionsAsked: 0, surveyCompleted: false, resourcesDownloaded: 0 });
    expect(engagementScore(strong)).toBeGreaterThan(engagementScore(noShow));
    expect(tierOf(strong).key).toBe("high");
    expect(tierOf(noShow).key).toBe("low");
  });

  it("produces a spread of recommendations across the sample list (not all identical)", () => {
    const winners = new Set(SAMPLE_LEADS.map((l) => recommend(l).winner.id));
    expect(winners.size).toBeGreaterThanOrEqual(3);
  });
});
