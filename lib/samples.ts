import { industry, INDUSTRIES } from "./industries";

export interface Sample {
  labelA: string;
  copyA: string;
  labelB: string;
  copyB: string;
}

// Message types the auto-craft drafter can generate (generic default).
export const MESSAGE_TYPES = [
  "Promotional offer",
  "Product / feature announcement",
  "Welcome / onboarding",
  "Re-engagement / win-back",
  "Newsletter",
  "Event invite",
  "Renewal / reminder",
  "Upsell / cross-sell",
  "Survey / feedback request",
  "Thank-you",
];

// Industry-specific message types — the auto-craft dropdown swaps to these when
// the industry changes. Anything not listed falls back to MESSAGE_TYPES.
export const MESSAGE_TYPES_BY_INDUSTRY: Record<string, string[]> = {
  ecommerce: ["Promotional offer", "Abandoned cart", "New arrival / drop", "Back in stock", "Loyalty / VIP reward", "Post-purchase / review request"],
  saas: ["Free-trial invite", "Onboarding nudge", "Feature announcement", "Upgrade / plan prompt", "Renewal reminder", "Win-back"],
  banking: ["New-account offer", "Savings / APY promo", "Fee-waiver offer", "Security / fraud alert", "Card / loan cross-sell", "Digital-banking nudge"],
  finance: ["Account / funding offer", "Rate / yield promo", "Portfolio review invite", "Fee transparency", "Market update", "Referral ask"],
  mortgage: ["Rate-drop alert", "Pre-qualification invite", "Refinance offer", "First-time buyer guide", "Application follow-up", "Closing / next steps"],
  insurance: ["Quote invite", "Renewal reminder", "Bundle-and-save offer", "Coverage-gap review", "Claims reassurance", "Life-event check-in"],
  realestate: ["New-listing alert", "Home-valuation offer", "Open-house invite", "Buyer consultation", "Price-drop alert", "Just-sold / market update"],
  healthcare: ["Appointment reminder", "New-patient welcome", "Preventive-care nudge", "Program announcement", "Patient survey", "Recall / re-engagement"],
  fitness: ["Membership offer", "Free-class / trial invite", "Challenge / program launch", "Lapsed-member win-back", "Milestone / progress", "Referral ask"],
  education: ["Program info / apply invite", "Info-session invite", "Financial-aid nudge", "Application follow-up", "Enrollment reminder", "Alumni / donor ask"],
  nonprofit: ["Fundraising appeal", "Year-end / matching gift", "Impact update", "Event invite", "Volunteer recruitment", "Lapsed-donor win-back"],
  travel: ["Deal / flash sale", "Trip inspiration", "Abandoned-booking follow-up", "Loyalty reward", "Pre-trip / upsell", "Post-trip review"],
  restaurants: ["Promotional offer", "New-menu announcement", "Reservation / event invite", "Loyalty reward", "Win-back", "Catering / group offer"],
  automotive: ["Sales / incentive offer", "Test-drive invite", "Trade-in appraisal", "Service reminder", "Lease-end / renewal", "New-model announcement"],
  media: ["Subscription offer", "Paywall / trial nudge", "Newsletter", "Renewal reminder", "Win-back", "Premium upsell"],
  telecom: ["Plan / upgrade offer", "New-line / device promo", "Retention / win-back", "Bill / autopay nudge", "Service announcement", "Add-on cross-sell"],
  energy: ["Plan / rate offer", "Renewal / contract reminder", "Efficiency program", "Enrollment invite", "Outage / service notice", "Referral ask"],
  legal: ["Consultation invite", "Case follow-up", "Practice announcement", "Client check-in", "Referral request", "Retainer / next steps"],
  homeservices: ["Seasonal service offer", "Free-estimate invite", "Maintenance reminder", "Post-job review request", "Membership / plan offer", "Win-back"],
  b2b: ["Demo / meeting invite", "Case-study / proof share", "Free trial / pilot offer", "Follow-up / nurture", "Renewal / expansion", "Re-engagement"],
  recruiting: ["Cold outreach", "Follow-up", "Re-engagement", "Interview invite", "Offer nudge", "Referral ask"],
  government: ["Program enrollment", "Deadline reminder", "Service announcement", "Benefits / eligibility notice", "Survey / feedback", "Public-safety notice"],
  gaming: ["New-release / launch", "Event / season announcement", "Lapsed-player win-back", "In-game offer / bundle", "Beta / early-access invite", "Community update"],
  crypto: ["Product / listing announcement", "Fee / promo offer", "Security notice", "Onboarding nudge", "Re-engagement", "Market update"],
};

/** Message types for an industry, falling back to the generic set. */
export function messageTypesFor(key: string): string[] {
  return MESSAGE_TYPES_BY_INDUSTRY[key] ?? MESSAGE_TYPES;
}

// Bespoke email A/B samples for the marquee verticals. Version A = story/benefit-led,
// Version B = offer/number-led, so the two are a real strategic contrast.
const BESPOKE: Record<string, Sample> = {
  banking: {
    labelA: "Peace of mind (trust-led)",
    copyA: `Subject: Your money should work as hard as you do

Hi there,

You've built something. A checking account shouldn't quietly chip away at it with fees you never agreed to.

Our free checking has no monthly maintenance fee, no minimum balance, and no surprises — plus 24/7 fraud monitoring so you can stop watching your account and start living.

Switching takes about 10 minutes, and we'll help you move your direct deposits and payments.

Open your account →`,
    labelB: "4.30% APY (offer-led)",
    copyB: `Subject: Earn 4.30% APY — 10x the national average

Hi there,

Your savings are probably earning next to nothing. Ours earns 4.30% APY — more than 10x the national average — with no minimum balance and no monthly fees.

- $10,000 saved earns ~$430 a year
- FDIC insured up to $250,000
- No fees, ever

Open a high-yield account in under 10 minutes.

Start earning →`,
  },
  mortgage: {
    labelA: "Your first home (reassurance-led)",
    copyA: `Subject: Buying your first home shouldn't feel this scary

Hi there,

First-time buyers tell us the same thing: the process is confusing and no one explains it. We fixed that.

You'll get one dedicated loan officer — a real person — who walks you through every step, answers every question, and never lets a deadline surprise you.

See what you qualify for in minutes, with no impact to your credit score.

Get pre-qualified →`,
    labelB: "Lock 6.1% (rate-led)",
    copyB: `Subject: Rates just dropped — lock 6.1% before they move

Hi there,

Rates are moving. Right now you can lock a 30-year fixed at 6.1% APR — and refinancing could cut your monthly payment by hundreds.

- Free rate quote in 3 minutes
- No impact to your credit to check
- Close in as little as 21 days

See your rate →`,
  },
  finance: {
    labelA: "Invest with confidence (guidance-led)",
    copyA: `Subject: Investing doesn't have to be intimidating

Hi there,

Most people don't invest because it feels complicated and risky. It doesn't have to.

We'll build you a diversified portfolio matched to your goals, automatically rebalanced, with a human advisor a message away whenever you have questions.

Start with any amount. Cancel anytime.

Build my plan →`,
    labelB: "0.25% fees (value-led)",
    copyB: `Subject: You're probably overpaying in fees

Hi there,

The average managed portfolio charges over 1% a year. On $100,000, that's $1,000+ — every year, whether markets go up or down.

Ours: a flat 0.25%. Same diversification, automatic rebalancing, tax-loss harvesting — for a quarter of the cost.

See how much you'd save →`,
  },
  insurance: {
    labelA: "Covered, whatever happens (reassurance-led)",
    copyA: `Subject: The coverage you hope you never need

Hi there,

Nobody likes thinking about what could go wrong. But if it does, you'll be glad someone picked up on the first ring and made it right.

Our claims team is rated #1 for customer satisfaction — real people, fast payouts, no runaround.

Get a quote in minutes and see how simple coverage can be.

Get my quote →`,
    labelB: "Save $500 (price-led)",
    copyB: `Subject: Drivers who switch save $500 on average

Hi there,

You could be overpaying. Drivers who switch to us save $500 a year on average — same coverage, lower price.

- Quote in under 5 minutes
- Bundle home + auto to save more
- No fees to switch

See your price →`,
  },
  ecommerce: {
    labelA: "Made to last (story-led)",
    copyA: `Subject: The last one you'll need to buy

Hi there,

We got tired of replacing cheap versions every year — so we made one that lasts. Solid materials, a lifetime guarantee, and a design people actually stop to ask about.

Join thousands of five-star reviews.

Shop the collection →`,
    labelB: "20% off today (offer-led)",
    copyB: `Subject: 20% off ends tonight

Hi there,

Our best-sellers are 20% off — today only.

- Free shipping over $50
- Free 30-day returns
- Ships in 1–2 days

Use code SAVE20 at checkout.

Shop now →`,
  },
  saas: {
    labelA: "Get your evenings back (outcome-led)",
    copyA: `Subject: Stop losing Fridays to busywork

Hi there,

Your team didn't sign up to copy data between spreadsheets. We automate the repetitive work so they can do the work that matters — and you can stop working weekends.

Teams save an average of 8 hours a week in the first month.

Start a free trial →`,
    labelB: "Free 14-day trial (offer-led)",
    copyB: `Subject: Try it free for 14 days — no card required

Hi there,

See it work on your own data in minutes:

- 14-day free trial, no credit card
- Set up in under 10 minutes
- Trusted by 5,000+ teams

Start free →`,
  },
  healthcare: {
    labelA: "Care that listens (reassurance-led)",
    copyA: `Subject: Same-day appointments, no more waiting rooms

Hi there,

Getting care shouldn't mean weeks of waiting and rushed visits. Our providers give you time, answer your questions, and follow up.

Same-day and next-day appointments are available now.

Book a visit →`,
    labelB: "Book online in 60 seconds (convenience-led)",
    copyB: `Subject: Book care online in under a minute

Hi there,

No phone tag. Book online in 60 seconds:

- Same-day appointments
- Most insurance accepted
- Virtual or in-person

Find a time →`,
  },
  realestate: {
    labelA: "Find home (story-led)",
    copyA: `Subject: The one you've been scrolling for

Hi there,

You know it when you see it — the light, the space, the feeling of "this is it." We'll help you find it and guide you through every step to the keys.

New listings in your area just dropped.

See the listings →`,
    labelB: "Free home valuation (offer-led)",
    copyB: `Subject: What's your home worth in today's market?

Hi there,

Prices have moved. Get a free, no-obligation valuation of your home in 60 seconds — based on real recent sales near you.

- Instant estimate
- Local expert review
- No pressure to list

Get my valuation →`,
  },
  recruiting: {
    labelA: "Personalized (relevance-led)",
    copyA: `Subject: Your work on distributed systems caught my eye

Hi there,

I came across your recent work and the way you've scaled things without a big team stood out — that's exactly the problem we're wrestling with right now.

I'm not going to pretend to know if this is the right moment for you. But if you're even a little curious, I'd love 15 minutes to tell you what we're building and hear what would make a move worth it for you.

No pressure either way — open to a quick chat?`,
    labelB: "The opportunity (role/comp-led)",
    copyB: `Subject: Senior Engineer · $180–210k · fully remote

Hi there,

Quick and direct — we're hiring a Senior Engineer and your background looks like a strong match:

- $180–210k + meaningful equity
- Fully remote (US time zones)
- Small team, real ownership, shipping weekly

If the numbers and setup work for you, I can share the full details and team in a 20-minute call.

Worth a conversation?`,
  },
  nonprofit: {
    labelA: "Maria's shelf (story-led)",
    copyA: `Subject: The shelf was empty when Maria got there

Dear Friend,

Maria works two jobs. Last Tuesday she reached our pantry twenty minutes before closing — and the shelf where the canned vegetables usually sit was bare.

That shelf should never be empty. A $25 gift fills a grocery cart for a family like Maria's, and this month every gift is matched.

Give today — your gift is doubled.`,
    labelB: "1 in 7 (stats-led)",
    copyB: `Subject: 1 in 7 of your neighbors will need this

Dear Friend,

1 in 7 households in our county will face food insecurity this year — and demand is up 22% while donations are down 9%.

- $25 provides 100 meals
- $50 provides 200 meals

Every gift this month is matched dollar-for-dollar.

Close the gap — give today.`,
  },
};

// Templated fallback so every industry gets industry-flavored fill.
function generic(key: string): Sample {
  const label = industry(key)?.label ?? "your business";
  const name = label.split(" / ")[0];
  return {
    labelA: "Benefit-led (story)",
    copyA: `Subject: The easier way to get what you came for

Hi there,

We built ${name.toLowerCase()} around one idea: make it simple, trustworthy, and genuinely useful — no runaround, no fine print.

Thousands of people already made the switch. See why in a couple of minutes.

Get started →`,
    labelB: "Offer-led (numbers)",
    copyB: `Subject: A better deal, in plain numbers

Hi there,

Here's the short version:

- Save time and money vs. what you use now
- Set up in minutes
- No hidden fees

Ready when you are.

See the offer →`,
  };
}

export function sampleFor(key: string): Sample {
  return BESPOKE[key] ?? generic(key);
}

// All sample copies, used to detect whether the editor is still "pristine"
// (untouched) so switching industries can safely refill it.
const KNOWN = new Set<string>();
for (const i of Object.keys(BESPOKE)) {
  KNOWN.add(BESPOKE[i].copyA);
  KNOWN.add(BESPOKE[i].copyB);
}
// generic() is deterministic per key; collect for every industry key too.
for (const i of INDUSTRIES) {
  const s = sampleFor(i.key);
  KNOWN.add(s.copyA);
  KNOWN.add(s.copyB);
}

export function isPristineCopy(copy: string): boolean {
  return copy.trim() === "" || KNOWN.has(copy);
}
