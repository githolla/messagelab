// Wilson score interval for a binomial proportion — honest uncertainty at the
// small panel sizes this engine runs (n≈20). Ported from Message Lab's
// lib/stats.ts. A count from 20 personas is not a precise estimate; the CI
// keeps callers from reading "15/20 would reply" as a hard number.

export function wilson(k, n, z = 1.96) {
  if (!n) return { low: 0, high: 0 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/** "60% · 95% CI 39–78%" — a share plus its Wilson band, as percentages. */
export function shareWithCI(k, n) {
  if (!n) return "—";
  const { low, high } = wilson(k, n);
  const pct = (x) => Math.round(x * 100);
  return `${pct(k / n)}% · 95% CI ${pct(low)}–${pct(high)}%`;
}
