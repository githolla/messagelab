// Dependency-free word-level diff (LCS). Ported from Message Lab's lib/diff.ts.
// Used by the refine loop to show exactly what each challenger changed.
// Returns tokens: { t: "same" | "del" | "add", v: string }.

export function wordDiff(before, after) {
  const a = String(before).split(/(\s+)/);
  const b = String(after).split(/(\s+)/);
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ t: "same", v: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: "del", v: a[i] });
      i++;
    } else {
      out.push({ t: "add", v: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ t: "del", v: a[i++] });
  while (j < n) out.push({ t: "add", v: b[j++] });
  return out;
}
