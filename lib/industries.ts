// Industry presets. The label drives the dropdown; the guidance retunes what
// the reviewer/analyst prioritizes. Score dimensions stay constant so results
// stay comparable — only the emphasis and findings shift by industry.
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
    key: "banking",
    label: "Banking",
    guidance:
      "Prioritize trust and security, transparency of fees and rates, clarity of account benefits, an obvious next step (open, apply, transfer), and regulatory/credibility cues. Balance reassurance with a concrete offer.",
  },
  {
    key: "finance",
    label: "Investing & wealth",
    guidance:
      "Prioritize credibility and track record, transparency of fees and returns, risk disclosure, plain-language guidance for non-experts, and a clear, low-pressure next step.",
  },
  {
    key: "mortgage",
    label: "Mortgage & lending",
    guidance:
      "Prioritize rate/APR clarity, total-cost transparency, trust and licensing cues, speed and simplicity of the application, and reassurance for an anxious, high-stakes decision.",
  },
  {
    key: "insurance",
    label: "Insurance",
    guidance:
      "Prioritize clarity of coverage and price, trust and claims reputation, a simple quote path, and reassurance that reduces the sense of risk and complexity.",
  },
  {
    key: "realestate",
    label: "Real estate",
    guidance:
      "Prioritize listing/imagery quality, location and price clarity, agent credibility, and an easy path to tour, inquire, or get pre-qualified.",
  },
  {
    key: "healthcare",
    label: "Healthcare / medical",
    guidance:
      "Prioritize trust and credibility, accessibility for older and low-vision users, plain-language clarity, an obvious next action (book, call, find care), and visible privacy/compliance cues.",
  },
  {
    key: "fitness",
    label: "Fitness & wellness",
    guidance:
      "Prioritize motivation and outcomes, clarity of the offer (plan, trial, class), social proof and transformation cues, and a low-friction start.",
  },
  {
    key: "education",
    label: "Education / edtech",
    guidance:
      "Prioritize clarity of the offering and outcomes, the enrollment or signup path, credibility and accreditation cues, and accessibility for a broad audience.",
  },
  {
    key: "nonprofit",
    label: "Nonprofit / fundraising",
    guidance:
      "Prioritize the clarity of the ask, the donation CTA and gift array, impact and storytelling, and trust/credibility cues.",
  },
  {
    key: "travel",
    label: "Travel / hospitality",
    guidance:
      "Prioritize the search-and-book flow, pricing and availability clarity, imagery quality, and trust signals (reviews, cancellation and refund policies).",
  },
  {
    key: "restaurants",
    label: "Restaurants & food",
    guidance:
      "Prioritize appetite appeal and imagery, menu/price clarity, an easy path to order or reserve, location/hours, and local trust signals.",
  },
  {
    key: "automotive",
    label: "Automotive",
    guidance:
      "Prioritize vehicle/offer clarity, pricing and financing transparency, trust and dealer credibility, and a clear path to test-drive, quote, or buy.",
  },
  {
    key: "media",
    label: "Media / publishing",
    guidance:
      "Prioritize readability and content hierarchy, discovery and navigation, ad density and intrusiveness, and any subscription, paywall, or newsletter flow.",
  },
  {
    key: "telecom",
    label: "Telecom / internet",
    guidance:
      "Prioritize plan and price clarity, transparency of fees and contract terms, coverage/speed proof, and a simple path to switch or sign up.",
  },
  {
    key: "energy",
    label: "Energy & utilities",
    guidance:
      "Prioritize rate/plan clarity, savings and transparency, trust and reliability, and a simple path to switch, enroll, or manage service.",
  },
  {
    key: "legal",
    label: "Legal services",
    guidance:
      "Prioritize trust and credibility, clarity about the service and process, reassurance for a stressed client, confidentiality cues, and an easy path to a consultation.",
  },
  {
    key: "homeservices",
    label: "Home services",
    guidance:
      "Prioritize trust and reviews, clear pricing and scope, availability/speed, and an easy path to book or get a quote.",
  },
  {
    key: "b2b",
    label: "B2B services / agency",
    guidance:
      "Prioritize a clear value proposition and outcomes, credibility (case studies, clients, results), and a low-friction path to a call or proposal.",
  },
  {
    key: "recruiting",
    label: "Recruiting / talent outreach",
    guidance:
      "Prioritize personalization and genuine relevance to the candidate, an honest and specific role (level, comp, remote/location), respect for their time, company credibility, and a low-pressure, concrete ask. Generic mass outreach is the enemy — reward messages that feel written for one person.",
  },
  {
    key: "government",
    label: "Government / public sector",
    guidance:
      "Prioritize plain-language clarity, accessibility, trust, and an unambiguous path to the correct action or information — minimize confusion and jargon.",
  },
  {
    key: "gaming",
    label: "Gaming",
    guidance:
      "Prioritize excitement and hook, clarity of what the game/offer is, social proof, and a fast path to play, download, or buy.",
  },
  {
    key: "crypto",
    label: "Crypto / web3",
    guidance:
      "Prioritize trust and security above all, transparency and plain language, credibility cues against a skeptical audience, and a careful, non-hype path to act.",
  },
];

export function industry(key?: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}
