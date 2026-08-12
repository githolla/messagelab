// Persona -> agent prompt. Adapted from MatrAIx's persona_dimension_catalog +
// persona_system.md.j2: render a persona as a grouped, SECOND-PERSON identity
// rather than a flat "key: value" dump, prune empty/placeholder dimensions, and
// forbid the model from breaking character or mentioning it's a simulation.
// This meaningfully improves realism over a flat dump, and works with as few or
// as many dimensions as a persona carries.

// Known dimension keys rendered as their own section, in this order. Anything
// not listed falls into a generic "A few more things about you" section.
const SECTIONS = [
  { key: "mindset", heading: "Your headspace right now" },
  { key: "how_they_judge", heading: "How you read a message like this" },
  { key: "hot_button", heading: "What wins or loses you" },
];

// Values that mean "no information" — pruned so they never reach the prompt.
const NULLISH = new Set(["", "none", "n/a", "na", "null", "unknown", "default", "-"]);
// Internal/bookkeeping keys never shown to the persona.
const HIDDEN_KEYS = new Set(["archetype", "note", "segment"]);

function isNullish(v) {
  return v == null || NULLISH.has(String(v).trim().toLowerCase());
}

/**
 * Build the second-person system prompt for a persona.
 * @param {object} persona - { name, dimensions: {...} }
 * @returns {string}
 */
export function renderPersona(persona) {
  const dims = persona.dimensions || {};
  const out = [
    `You are ${persona.name}, a real person reacting to a message — not an average, not a focus group, not an assistant.`,
  ];

  for (const { key, heading } of SECTIONS) {
    if (!isNullish(dims[key])) out.push(`\n## ${heading}\n${String(dims[key]).trim()}`);
  }

  // Any remaining, non-hidden, non-empty dimensions get a catch-all section so
  // custom archetypes with extra fields still surface.
  const known = new Set(SECTIONS.map((s) => s.key));
  const extras = Object.entries(dims)
    .filter(([k, v]) => !known.has(k) && !HIDDEN_KEYS.has(k) && !isNullish(v))
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${String(v).trim()}`);
  if (extras.length) out.push(`\n## A few more things about you\n${extras.join("\n")}`);

  out.push(
    `\nAnswer as THIS person only — bring your own quirks, mood, and priorities, and react the way you genuinely would, not the way an agreeable average would. "I'd ignore this" is a valid reaction. Never mention that you are a simulation, a persona, an AI, or a model, and never break character.`
  );

  return out.join("\n");
}
