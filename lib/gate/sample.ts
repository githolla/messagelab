// Seeded sample for the Deterministic Gate — a fictional tribal-college RFP,
// a first draft with the classic defects planted (placeholders, a wrong-format
// cost table, a name without a title, stale prior-client residue, stuffing,
// agency-first prose), and a rebuild that fixes most of it but deliberately
// keeps two blocking findings. A gate that flattered the rebuild would be
// worthless. All fictional names.

import type { GateContext } from "./model";

export const SAMPLE_RFP = `# Request for Proposals — Direct Mail Fundraising Partner
Prairie Winds College seeks a direct response partner for annual giving.

Proposals must include:
- An executive summary
- A cost proposal presented as a table
- Three client references
- A twelve-month campaign timeline
- Creative samples from comparable campaigns

The cost table must include the following columns: Campaign Track, Mailings, Volume, Cost.

Vendors must demonstrate experience with direct mail acquisition and donor retention programs.
Proposals must be submitted by September 15 to the Institutional Development Office.
Vendors are encouraged to demonstrate how their work will honor the college's voice and community.
We prefer references from similar organizations — tribal colleges or Native-led institutions.
The selected vendor will be required to report results quarterly to the advancement team.`;

export const SAMPLE_DRAFT = `# Cover Letter
Dear Dana Whitehorse and members of the committee,

We are excited to submit our proposal. We bring proven, world-class direct response experience to this work. We build culturally grounded messaging tracks for every audience, and our culturally grounded messaging tracks have delivered results across the sector. Who understands your donors better than a partner who listens? And who else can bring this depth of experience?

We will manage every campaign track and deliver reporting your team can use. We provide creative development, we produce the mail package, and we handle list management. We strive to exceed expectations in every engagement.

# Executive Summary
Our culturally grounded messaging tracks approach pairs acquisition with retention. We develop culturally grounded messaging tracks for renewal, and we design culturally grounded messaging tracks for win-back audiences. Our campaigns improved results by 38% last year. Our work with Native Forward Scholars Fund shows what culturally grounded messaging tracks can do, and our JDRF program demonstrated the model at national scale. JDRF results included measurable retention gains.

We will grow your donor file. We will strengthen renewal revenue. We will improve retention across every segment. We will increase net revenue year over year.

# Cost Proposal
Estimated investment: $XX,XXX — $XX,XXX for acquisition and $XX,XXX for renewal.

| Program | Cost |
| Acquisition | $48,000 |
| Renewal | $31,000 |
| Total | $84,000 |

[Insert final pricing]

# References
Water For People — national nonprofit client since 2022.
Parents as Teachers — direct response program.
Marcus Fields is available as a reference contact.`;

export const SAMPLE_REBUILD = `# 1. Executive Summary
Prairie Winds College asked for a partner who can grow annual giving without borrowing the college's voice. Your team keeps narrative authority; we bring direct response discipline. Dana Whitehorse, Vice President of Advancement, set the bar clearly in the RFP: honor the college's voice and community. This proposal answers each requirement in order — summary, cost table in the prescribed format, references, timeline, and creative samples.

# 2. Campaign Timeline
Your twelve-month calendar runs acquisition, renewal, and win-back with quarterly reporting to the advancement team, per the RFP. According to the Fundraising Effectiveness Project 2025 report, donor counts declined 4.5% of the 2024 base year — which is why retention leads this plan.

| Campaign Track | Mailings | Volume | Cost |
| Acquisition | 3 | 60,000 | $48,000 |
| Renewal | 4 | 22,000 | $31,000 |
| Win-back | 2 | 8,000 | $9,000 |
| Total | 9 | 90,000 | $88,000 |

# 3. References
Per your stated preference for tribal colleges and Native-led institutions, we offer Native Forward Scholars Fund, a Native-led education client, alongside Parents as Teachers. Marcus Fields can also speak to our reporting.

# 4. Creative Samples
Samples from three comparable campaigns are attached, including acquisition packages built with client-owned voice and photography under documented consent.

# Appendix D. Fee detail
Final subprocessor pricing is confirmed at signature: [AGP] — $ [AGP] for data processing and [AGP] — $ [AGP] for co-op list access.`;

export const SAMPLE_CONTEXT: GateContext = {
  client: {
    name: "Prairie Winds College",
    subsector: "higher education",
    budgetBand: "under $5M",
    fileSize: "small",
    region: "Northern Plains",
    orgType: "tribal college",
    toolset: ["GivingDNA"],
    channels: ["direct mail"],
  },
  people: [
    { name: "Dana Whitehorse", title: "Vice President of Advancement" },
    { name: "Marcus Fields", title: "Institutional Development Director" },
  ],
  referencesOffered: ["Water For People", "Parents as Teachers"],
  citedCaseStudies: [
    { name: "Native Forward Scholars Fund", subsector: "higher education", budgetBand: "under $5M", fileSize: "small", region: "national", orgType: "Native-led nonprofit", toolset: ["GivingDNA"], channels: ["direct mail"] },
    { name: "Parents as Teachers", subsector: "human services", budgetBand: "$5M-$20M", fileSize: "medium", region: "national", orgType: "nonprofit", toolset: [], channels: ["direct mail"] },
    { name: "Water For People", subsector: "international development", budgetBand: "$20M+", fileSize: "large", region: "global", orgType: "nonprofit", toolset: [], channels: ["digital"] },
  ],
  sources: [
    { name: "Fundraising Effectiveness Project", year: 2025, maxAgeYears: 2 },
    { name: "M+R Benchmarks", year: 2026, maxAgeYears: 2 },
  ],
  publishedAggregates: [
    { label: "Renewal return per $1", value: 4.51, tolerancePct: 10 },
  ],
  modelInputs: [
    { name: "Acquisition response rate", source: "AGP client median 2024-2026", consequence: "volume shortfall raises cost per donor" },
    { name: "Average gift", source: "College's FY25 file", consequence: "revenue projection scales linearly" },
    { name: "Renewal rate", source: "FEP 2025", consequence: "file shrinks; win-back volume grows" },
  ],
  staleTerms: ["JDRF"],
  agencyNames: ["We", "Our", "AGP"],
  clientNames: ["Prairie Winds", "the College", "You", "Your"],
};

/** The context as editable JSON for the UI. */
export const SAMPLE_CONTEXT_JSON = JSON.stringify(SAMPLE_CONTEXT, null, 2);
