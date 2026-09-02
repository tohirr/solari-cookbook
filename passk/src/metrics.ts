import type { BenchMetrics, RunResult } from "./types.js";

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * pass@k and pass^k from n runs with c passes.
 *
 * pass@k  = P(at least one of k passes) = 1 - C(n-c, k) / C(n, k)   (Chen et al. 2021)
 * pass^k  = P(all k pass)               = C(c, k) / C(n, k)           (Yao et al. 2024, tau-bench)
 *
 * Both are the unbiased estimators over the sample rather than (c/n)^k, which
 * overstates consistency on small n.
 */
export function computeMetrics(allRuns: RunResult[]): BenchMetrics {
  // A run that errored before the agent took a single step is an infrastructure
  // failure (fork never booted, API down). It is reported, but it is not the
  // agent's reliability, so it is excluded from the pass estimators.
  const errored = allRuns.filter((r) => r.status === "errored" && r.steps.length === 0).length;
  const runs = allRuns.filter((r) => !(r.status === "errored" && r.steps.length === 0));
  const n = runs.length;
  const c = runs.filter((r) => r.status === "passed").length;
  const passPowK: Record<number, number> = {};
  const passAtK: Record<number, number> = {};
  for (let k = 1; k <= n; k++) {
    passPowK[k] = choose(c, k) / choose(n, k);
    passAtK[k] = 1 - choose(n - c, k) / choose(n, k);
  }
  const stepCounts = runs.map((r) => r.steps.length);
  return {
    n,
    passed: c,
    errored,
    passAt1: n ? c / n : 0,
    passPowK,
    passAtK,
    meanSteps: n ? stepCounts.reduce((a, b) => a + b, 0) / n : 0,
    minSteps: n ? Math.min(...stepCounts) : 0,
    maxSteps: n ? Math.max(...stepCounts) : 0,
    meanDurationMs: n ? runs.reduce((s, r) => s + r.durationMs, 0) / n : 0,
  };
}
