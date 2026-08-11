// Wilson score interval for a binomial proportion — honest uncertainty at the
// small panel sizes this app runs (n≈24). The MatrAIx paper's own n≈24 App
// cohorts produced intervals wide enough that no subgroup effect survived
// correction; headline rates here get the same treatment so a count is never
// mistaken for a precise estimate.
export function wilson(k: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/** "41% · 95% CI 24–61%" — a share plus its Wilson band, both as percentages. */
export function shareWithCI(k: number, n: number): string {
  if (n === 0) return "—";
  const { low, high } = wilson(k, n);
  const pct = (x: number) => Math.round(x * 100);
  return `${pct(k / n)}% · 95% CI ${pct(low)}–${pct(high)}%`;
}
