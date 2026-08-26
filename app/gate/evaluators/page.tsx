import type { Metadata } from "next";
import RosterBrowser from "@/components/RosterBrowser";

export const metadata: Metadata = {
  title: "The evaluator roster — Message Lab",
  description:
    "All 100 evaluators across families A–G, spelled out: committee personas, subsector lenses, buyer-state adversaries, deterministic checks, auditors, verifiers, and meta critics.",
};

export default function EvaluatorsPage() {
  return <RosterBrowser />;
}
