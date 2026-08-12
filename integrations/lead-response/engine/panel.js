// Stage 1 — build the panel. Pure data, no API calls. Expands a small set of
// lead archetypes into individual persona instances so each segment carries a
// usable sample. Swap LEAD_ARCHETYPES (or pass your own array) to change the
// audience — e.g. load it from a SQLite table per campaign.
//
// Each archetype carries a few descriptive fields (mindset / how they read a
// message / hot button). These feed the grouped, second-person persona prompt
// in persona-render.js — richer archetypes → more realistic reactions.

/**
 * The default "lead response" audience: the archetypes a sales reply has to win.
 * Fields: name, how (how they judge), mindset (their headspace), hot (what wins
 * or loses them). All optional except name; the renderer prunes anything empty.
 */
export const LEAD_ARCHETYPES = [
  {
    name: "Ready Buyer",
    how: "Skims for the next step and takes it if it's obvious",
    mindset: "You already want this. Anything that slows you down or adds friction annoys you.",
    hot: "A clear, immediate way to move forward wins you. Vagueness or delay loses you.",
  },
  {
    name: "Price Shopper",
    how: "Reads for cost, terms, and whether there's a better deal elsewhere",
    mindset: "You assume you can get it cheaper somewhere, and you're quietly testing this company against others.",
    hot: "Concrete numbers, terms, and a reason you're a fair deal win you. Dodging price loses you.",
  },
  {
    name: "Skeptical Researcher",
    how: "Hunts for proof, specifics, and reasons to believe before replying",
    mindset: "You've been burned by hype before. You trust specifics and evidence, not enthusiasm.",
    hot: "Proof points, specifics, and a measured tone win you. Salesy adjectives and pressure lose you.",
  },
  {
    name: "Busy Skimmer",
    how: "Reads three lines on a phone between meetings, then decides",
    mindset: "You're distracted and short on time. If the point isn't obvious in seconds, you're gone.",
    hot: "A short, skimmable message with one clear ask wins you. A wall of text loses you.",
  },
  {
    name: "Ghoster",
    how: "Half-regrets enquiring; needs a reason to stay engaged",
    mindset: "You reached out on a whim and you're already cooling off. Only something genuinely personal keeps you here.",
    hot: "A personal, low-pressure, human note wins you back. Anything templated makes you disappear.",
  },
];

/**
 * Expand archetypes into individual personas.
 * @param {Array}  [archetypes=LEAD_ARCHETYPES] - [{ name, how, mindset, hot }]
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
          // Rendered into grouped sections by persona-render.js; empty values pruned.
          mindset: a.mindset || "",
          how_they_judge: a.how || "",
          hot_button: a.hot || "",
        },
      });
    }
  }
  return panel;
}
