// Shared Anthropic Messages-API client. Centralizes the retry/backoff loop and
// per-attempt timeout so every route (run, analyze, refine, draft, review) is
// resilient to the transient 429/529/5xx that fan-out traffic provokes, instead
// of only the run route being hardened.

export interface ModelMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface CallModelParams {
  apiKey: string;
  model: string;
  maxTokens: number;
  system?: string;
  messages: ModelMessage[];
  /** Per-attempt timeout in ms (an abort is treated as a transient failure). */
  timeoutMs?: number;
  /** Total attempts including the first (default 4). */
  attempts?: number;
}

/** Thrown when the model call ultimately fails; carries an HTTP-ish status. */
export class ModelError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Model call failed (${status}): ${detail.slice(0, 300)}`);
    this.name = "ModelError";
    this.status = status;
    this.detail = detail;
  }
}

const ENDPOINT = "https://api.anthropic.com/v1/messages";

/**
 * Call the model with retry + timeout and return the assistant's text.
 * Throws ModelError on definitive failure.
 */
export async function callModel(p: CallModelParams): Promise<string> {
  const attempts = p.attempts ?? 4;
  const timeoutMs = p.timeoutMs ?? 45000;
  const body = JSON.stringify({
    model: p.model,
    max_tokens: p.maxTokens,
    ...(p.system ? { system: p.system } : {}),
    messages: p.messages,
  });

  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": p.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      // Network error / abort — treat as transient and retry.
      clearTimeout(timer);
      lastStatus = 0;
      lastDetail =
        e instanceof Error && e.name === "AbortError"
          ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
          : e instanceof Error
            ? e.message
            : "network error";
      if (attempt < attempts - 1) {
        await sleep(800 * Math.pow(2, attempt));
        continue;
      }
      throw new ModelError(504, lastDetail);
    }
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      return (data.content?.[0]?.text as string) ?? "";
    }

    lastStatus = resp.status;
    lastDetail = await resp.text();
    const transient = resp.status === 429 || resp.status === 529 || resp.status >= 500;
    if (!transient || attempt === attempts - 1) {
      throw new ModelError(lastStatus, lastDetail);
    }
    const retryAfter = Number(resp.headers.get("retry-after")) || 0;
    await sleep(retryAfter ? retryAfter * 1000 : 800 * Math.pow(2, attempt));
  }

  throw new ModelError(lastStatus || 502, lastDetail || "exhausted retries");
}

/** Extract and parse the first JSON object in a model response. */
export function extractJson<T = unknown>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No parseable JSON in model response.");
  return JSON.parse(match[0]) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
