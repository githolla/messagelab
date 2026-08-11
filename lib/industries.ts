// Industry presets for the page-review tool. The label drives the dropdown;
// the guidance is appended to the review prompt to retune what the reviewer
// prioritizes. Score dimensions stay constant so reviews stay comparable —
// only the emphasis and the findings shift by industry.
export interface Industry {
  key: string;
  label: string;
  guidance: string;
}

export const INDUSTRIES: Industry[] = [
  { key: "general", label: "General / other", guidance: "" },
  {
    key: "ecommerce",
    label: "E-commerce / retail",
    guidance:
      "Prioritize product clarity, pricing and shipping/returns transparency, add-to-cart and checkout friction, and trust signals (ratings, reviews, security and return badges). Judge how quickly a shopper can find and buy.",
  },
  {
    key: "saas",
    label: "SaaS / B2B software",
    guidance:
      "Prioritize a clear above-the-fold value proposition, the primary signup/demo CTA, social proof (customer logos, testimonials), and pricing clarity. Judge whether the core benefit is understandable within seconds.",
  },
  {
    key: "healthcare",
    label: "Healthcare / medical",
    guidance:
      "Prioritize trust and credibility, accessibility for older and low-vision users, plain-language clarity, an obvious next action (book, call, find care), and visible privacy/compliance cues.",
  },
  {
    key: "finance",
    label: "Finance / fintech",
    guidance:
      "Prioritize security and trust signals, transparency of fees, rates and terms, regulatory and credibility cues, and onboarding/data-entry friction. Judge clarity for high-stakes financial decisions.",
  },
  {
    key: "media",
    label: "Media / publishing",
    guidance:
      "Prioritize readability and content hierarchy, discovery and navigation, ad density and intrusiveness, and any subscription, paywall, or newsletter flow.",
  },
  {
    key: "education",
    label: "Education / edtech",
    guidance:
      "Prioritize clarity of the offering and outcomes, the enrollment or signup path, credibility and accreditation cues, and accessibility for a broad audience.",
  },
  {
    key: "travel",
    label: "Travel / hospitality",
    guidance:
      "Prioritize the search-and-book flow, pricing and availability clarity, imagery quality, and trust signals (reviews, cancellation and refund policies).",
  },
  {
    key: "nonprofit",
    label: "Nonprofit / fundraising",
    guidance:
      "Prioritize the clarity of the ask, the donation CTA and gift array, impact and storytelling, and trust/credibility cues.",
  },
];

export function industry(key?: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}
