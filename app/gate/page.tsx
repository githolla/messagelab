import type { Metadata } from "next";
import GateTool from "@/components/GateTool";

export const metadata: Metadata = {
  title: "The Deterministic Gate — Message Lab",
  description:
    "Thirty model-free checks against a proposal and its RFP. Zero model calls, no API key — anything blocking means the draft does not ship.",
};

export default function GatePage() {
  return <GateTool />;
}
