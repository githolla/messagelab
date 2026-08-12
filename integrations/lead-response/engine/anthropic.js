// Minimal Anthropic Messages API client — raw fetch, no SDK dependency.
// Retries transient failures (429 rate-limit / 529 overload / 5xx) with
// exponential backoff, honoring a Retry-After header when present. This is the
// only file that talks to the network; everything else is pure logic.
//
// Requires Node 18+ (global fetch). Zero npm dependencies.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Call the Anthropic Messages API and return the assistant's text.
 * @param {object} p
 * @param {string} p.apiKey   - ANTHROPIC_API_KEY (server-side only)
 * @param {string} p.model    - e.g. "claude-sonnet-4-6"
 * @param {string} p.system   - system prompt
 * @param {Array}  p.messages - Messages API messages array
 * @param {number} [p.maxTokens=1024]
 * @returns {Promise<string>} the first text block of the response
 */
export async function callClaude({ apiKey, model, system, messages, maxTokens = 1024 }) {
  if (!apiKey) throw new Error("Missing Anthropic API key.");
  const body = JSON.stringify({ model, max_tokens: maxTokens, system, messages });

  let resp = null;
  let lastDetail = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    if (resp.ok) break;
    lastDetail = await resp.text();
    const transient = resp.status === 429 || resp.status === 529 || resp.status >= 500;
    if (!transient || attempt === 3) break;
    const retryAfter = Number(resp.headers.get("retry-after")) || 0;
    const wait = retryAfter ? retryAfter * 1000 : 800 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
  }

  if (!resp || !resp.ok) {
    const status = resp ? resp.status : 0;
    throw new Error(`Anthropic call failed (${status}): ${lastDetail.slice(0, 300)}`);
  }

  const data = await resp.json();
  return (data.content && data.content[0] && data.content[0].text) || "";
}

/** Pull the first {...} JSON object out of a string and parse it. */
export function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model returned no parseable JSON.");
  return JSON.parse(match[0]);
}

/**
 * Call Claude and return parsed JSON, hardened against chatty/truncated output.
 * Two mechanisms borrowed from common Anthropic practice:
 *   1. Assistant prefill — seed the reply with "{" so the model must continue a
 *      JSON object instead of prose. We prepend the "{" back before parsing.
 *   2. One repair retry — if parsing still fails, re-ask for JSON only.
 * @param {object} p - same shape as callClaude (system, messages, model, ...)
 * @returns {Promise<object>}
 */
export async function callClaudeJson(p) {
  const primed = {
    ...p,
    messages: [...p.messages, { role: "assistant", content: "{" }],
  };
  const text = await callClaude(primed);
  try {
    return extractJson("{" + text);
  } catch {
    // Repair pass: ask plainly for a single JSON object, no prefill.
    const repair = await callClaude({
      ...p,
      messages: [
        ...p.messages,
        { role: "assistant", content: text },
        { role: "user", content: "That was not valid JSON. Reply with ONLY the JSON object, nothing else." },
      ],
    });
    return extractJson(repair);
  }
}
