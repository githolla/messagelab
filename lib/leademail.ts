// Lead Personalization — follow-up email drafting.
//
// Once the simulation has chosen a strategy, we still write the email in Diane's
// voice using her existing resource system. This module has the deterministic
// draft (so the demo works with no API key) that the live /api/lead-email route
// upgrades when a key is present. Both take the SAME (lead, strategy) inputs, so
// the recommendation drives the copy either way.

import type { Lead, Webinar, Strategy } from "./leads";

export interface EmailDraft {
  subject: string;
  body: string;
}

const SIGNATURE = "Diane Roberts\nAllegiance Group + Pursuant";

function firstName(l: Lead): string {
  return l.name.split(" ")[0];
}

// A plausible AGP resource matched to what the lead demonstrated interest in.
function resourceFor(l: Lead, w: Webinar): string {
  const t = (l.surveyInterest || l.topicSignal || w.topic).toLowerCase();
  if (t.includes("second-gift") || t.includes("reactivation") || t.includes("lapsed"))
    return "our second-gift conversion playbook";
  if (t.includes("mid-level")) return "our mid-level donor journey framework";
  if (t.includes("segment") || t.includes("cadence") || t.includes("email"))
    return "our retention email cadence guide";
  if (t.includes("recurring") || t.includes("sustainer") || t.includes("upgrade"))
    return "our recurring-gift upgrade toolkit";
  if (t.includes("welcome") || t.includes("onboard") || t.includes("new-donor"))
    return "our new-donor welcome-series blueprint";
  if (t.includes("benchmark") || t.includes("report"))
    return "our donor retention benchmark report";
  if (t.includes("stewardship") || t.includes("gratitude") || t.includes("thank"))
    return "our donor stewardship starter kit";
  return "our donor retention field guide";
}

function topicPhrase(l: Lead, w: Webinar): string {
  return l.topicSignal || w.topic;
}

/** Deterministic, personalized draft for a strategy. No API, no randomness. */
export function draftEmail(lead: Lead, strategy: Strategy, webinar: Webinar): EmailDraft {
  const fn = firstName(lead);
  const topic = topicPhrase(lead, webinar);
  const resource = resourceFor(lead, webinar);
  const askedQ = lead.questionsAsked > 0;

  switch (strategy.id) {
    case "insight":
      return {
        subject: `One more thought on ${topic}`,
        body: `Hi ${fn},

Thanks for joining "${webinar.title}" — ${
          askedQ
            ? `your question during the session stood out to me`
            : `it was good to have ${lead.company} in the room`
        }, especially the part on ${topic}.

One idea we didn't get to: the organizations that move the needle on ${topic} usually start with their most recent first-time donors, not their whole file. A single well-timed second touch in the first 90 days tends to lift retention more than a broad year-end push.

If that's useful I'm happy to share what that looks like in practice — no agenda, just thought it might land given where ${lead.company} is focused.

Best,
${SIGNATURE}`,
      };

    case "conversation":
      return {
        subject: `Quick question after the webinar`,
        body: `Hi ${fn},

I noticed you stayed through the whole ${webinar.topic} session${
          askedQ ? ` and asked about ${topic}` : ``
        } — that usually means it's a live priority, not a someday-thing.

Quick question: at ${lead.company}, is ${topic} something you're actively working on right now, or more on the radar for next year?

No pitch — just curious where you're at. Happy to trade notes either way.

Best,
${SIGNATURE}`,
      };

    case "resource":
      return {
        subject: `The ${topic} resource I mentioned`,
        body: `Hi ${fn},

Following up from "${webinar.title}" — based on what you were digging into around ${topic}, I think ${resource} is the most useful thing I can put in front of you.

It's a short, practical walkthrough (no gate, no form) covering exactly the retention angle you flagged. Here's the link: [${resource}].

If it sparks anything for ${lead.company}, I'm around.

Best,
${SIGNATURE}`,
      };

    case "takeaway":
      return {
        subject: `Your takeaway from ${webinar.topic}`,
        body: `Hi ${fn},

Thanks for joining "${webinar.title}." If you take one thing from it, make it this:

Retention is won in the first 90 days, not at renewal. The single highest-return move for most teams is a fast, specific thank-you within 48 hours of a first gift — before any ask.

That's the piece most teams underuse, and it's the cheapest to fix. Thought it was worth putting in your inbox while it's fresh.

Best,
${SIGNATURE}`,
      };

    case "meeting":
      return {
        subject: `15 minutes on ${topic}?`,
        body: `Hi ${fn},

You were one of the most engaged people in "${webinar.title}"${
          askedQ ? ` — your question on ${topic} in particular` : ``
        }, and ${
          lead.relationship === "client"
            ? `since we're already working together`
            : `given what ${lead.company} is focused on`
        }, I think a short conversation would be worth your time.

Would a quick 15 minutes in the next week or two make sense? I'll come with one or two specific ideas on ${topic} for ${lead.company} — not a sales call.

Here's my calendar: [link]. Or just reply with a couple of times.

Best,
${SIGNATURE}`,
      };

    case "next_webinar":
      return {
        subject: `Since ${topic} is on your radar — next session`,
        body: `Hi ${fn},

Glad you joined "${webinar.title}." Since ${topic} clearly matters to ${lead.company}, you might get a lot from our next session, which goes a level deeper on turning first gifts into lasting relationships.

I'll save you a seat: [link]. And if there's a specific angle you'd want covered, tell me — we shape these around what attendees actually ask.

Best,
${SIGNATURE}`,
      };

    case "nurture":
      return {
        subject: `Something that made me think of ${lead.company}`,
        body: `Hi ${fn},

No ask here — just staying in touch after the ${webinar.topic} webinar.

A lot of teams like ${lead.company} are quietly rethinking how they welcome new donors this year, and it made me think you might find ${resource} handy down the line. Filing it your way in case it's useful later.

Always happy to talk when the timing's right.

Best,
${SIGNATURE}`,
      };

    case "wait":
    default:
      return {
        subject: `(Hold — no send recommended yet)`,
        body: `The simulation recommends waiting on an individual follow-up for ${lead.name}. The signal from this webinar is too light to justify a personal touch right now — an early ask is more likely to cost the relationship than earn a reply.

Suggested hold: keep ${firstName(lead)} in the general audience, and re-evaluate if they attend another session, open a nurture email, or download a resource.

If you'd still like to reach out, switch to "Light nurture" above for the lowest-pressure option.`,
      };
  }
}
