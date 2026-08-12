// A small, React-free concurrent worker pool. Extracted so the fan-out logic is
// unit-testable and so results come back in input order (a pre-sized array
// indexed by position) instead of completion order, which used to shuffle the
// participant cards by whichever worker finished first.

export interface PoolHandlers {
  concurrency: number;
  /** Called once per settled item (success or failure) so the UI can tick progress. */
  onSettle?: (index: number) => void;
}

/**
 * Map `items` through `fn` with bounded concurrency. Each result lands at its
 * input index. `fn` should resolve to a value; if it throws, that slot becomes
 * `null` (callers filter). Order-preserving.
 */
export async function pooledMap<I, O>(
  items: I[],
  fn: (item: I, index: number) => Promise<O>,
  { concurrency, onSettle }: PoolHandlers
): Promise<(O | null)[]> {
  const out: (O | null)[] = new Array(items.length).fill(null);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
      onSettle?.(i);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
  await Promise.all(workers);
  return out;
}
