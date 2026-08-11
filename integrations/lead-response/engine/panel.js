// Stage 1 — build the panel. Pure data, no API calls. Expands a small set of
// lead archetypes into individual persona instances so each segment carries a
// usable sample. Swap LEAD_ARCHETYPES (or pass your own array) to change the
// audience — e.g. load it from a SQLite table per campaign.

/**
 * The default "lead response" audience: the archetypes a sales reply has to win.
 * `base` (0-1) is a rough propensity-to-act, kept for parity with Message Lab's
 * deterministic demo mode; the live engine doesn't use it, so it's optional.
 */
export const LEAD_ARCHETYPES = [
  { name: "Ready Buyer", how: "Already interested — just needs a clear next step, fast", base: 0.75 },
  { name: "Price Shopper", how: "Comparing quotes; reacts to cost, terms, and urgency", base: 0.5 },
  { name: "Skeptical Researcher", how: "Wants proof, specifics, and reasons to believe before replying", base: 0.4 },
  { name: "Busy Skimmer", how: "Reads three lines on a phone; bails unless the point is obvious", base: 0.35 },
  { name: "Ghoster", how: "Enquired on a whim; goes silent without a genuine, personal hook", base: 0.25 },
];

/**
 * Expand archetypes into individual personas.
 * @param {Array}  [archetypes=LEAD_ARCHETYPES] - [{ name, how }]
 * @param {number} [instances=4] - personas per archetype (5 x 4 = a 20-persona panel)
 * @returns {Array} personas: [{ id, name, segment, dimensions }]
 */
export function buildPanel(archetypes = LEAD_ARCHETYPES, instances = 4) {
  const panel = [];
  for (const a of archetypes) {
    for (let i = 0; i < instances; i++) {
      panel.push({
        id: `${a.name}:${i}`,
        name: `${a.name} #${i + 1}`,
        segment: a.name,
        dimensions: {
          archetype: a.name,
          how_they_judge: a.how,
          note: "You are one specific individual of this type — bring your own quirks, mood, and priorities. Do not answer as a generic average.",
        },
      });
    }
  }
  return panel;
}
