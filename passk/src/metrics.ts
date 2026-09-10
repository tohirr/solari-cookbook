import type { BenchMetrics, RunResult } from "./types.js";

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Wilson score interval for a binomial proportion. Chosen over the normal
 * approximation because it behaves at the edges (10/10, 0/10) and over
 * Clopper-Pearson because it is closed-form. z = 1.96 for 95%.
 */
export function wilson(successes: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lower: Math.max(0, (centre - half) / denom), upper: Math.min(1, (centre + half) / denom) };
}

/**
 * The smallest all-pass sample whose Wilson lower bound reaches `target`.
 * 0.70 → 10, 0.90 → 35, 0.95 → 73. This is what a requested confidence
 * costs, and the tool says so before any money is spent.
 */
export function runsForLowerBound(target: number, z = 1.96): number {
  for (let n = 1; n <= 10_000; n++) if (wilson(n, n, z).lower >= target) return n;
  return Infinity;
}

/**
 * pass@k and pass^k from n attempted runs with c passes.
 *
 * pass@k  = P(at least one of k passes) = 1 - C(n-c, k) / C(n, k)   (Chen et al. 2021)
 * pass^k  = P(all k pass)               = C(c, k) / C(n, k)           (Yao et al. 2024, tau-bench)
 *
 * Both are unbiased estimators over the sample rather than (c/n)^k, which
 * overstates consistency on small n. They are still point estimates from a
 * small sample: the Wilson interval on pass@1 is reported alongside, and the
 * pass^k interval is that interval raised to the k (a monotone transform, so
 * it is exact for the bound, not a new estimate).
 *
 * Two denominators are kept on purpose. `n` counts runs the agent actually
 * attempted; `requested` counts what the user asked for. A fork that never
 * booted is not the agent's fault, but the user still did not get their run.
 */
/**
 * A run is "lost" (not scored against the agent) when it errored for a reason
 * that is not the agent's: the desktop never came up, the model API was down,
 * or the verifier itself crashed. Older benches carry no errorKind; for them
 * an errored run with no steps is treated as a Solari loss, matching the rule
 * that produced their numbers.
 */
export function lostKind(r: RunResult): "solari" | "provider" | "verifier" | null {
  if (r.status !== "errored") return null;
  if (r.errorKind === "provider" || r.errorKind === "verifier" || r.errorKind === "solari") return r.errorKind;
  return r.steps.length === 0 ? "solari" : null;
}

export function computeMetrics(allRuns: RunResult[], requested = allRuns.length): BenchMetrics {
  const lost = { solari: 0, provider: 0, verifier: 0 };
  for (const r of allRuns) { const k = lostKind(r); if (k) lost[k]++; }
  const errored = lost.solari + lost.provider + lost.verifier;
  const runs = allRuns.filter((r) => lostKind(r) === null);
  const n = runs.length;
  const c = runs.filter((r) => r.status === "passed").length;
  const ci = wilson(c, n);
  const passPowK: Record<number, number> = {};
  const passAtK: Record<number, number> = {};
  const passPowKLower: Record<number, number> = {};
  for (let k = 1; k <= n; k++) {
    passPowK[k] = choose(c, k) / choose(n, k);
    passAtK[k] = 1 - choose(n - c, k) / choose(n, k);
    passPowKLower[k] = Math.pow(ci.lower, k);
  }
  const stepCounts = runs.map((r) => r.steps.length).sort((a, b) => a - b);
  const durations = runs.map((r) => r.durationMs).sort((a, b) => a - b);
  const passedRuns = runs.filter((r) => r.status === "passed");
  const costPassed = passedRuns.reduce((s, r) => s + (r.usage.costUsd ?? 0), 0);
  // Every scored attempt is part of the price of a success: nine failures
  // before the tenth pass are not free. Lost runs (infra) are excluded here
  // and in n, and their spend is only in totalCostUsd.
  const costScored = runs.reduce((s, r) => s + (r.usage.costUsd ?? 0), 0);
  return {
    requested,
    n,
    passed: c,
    errored,
    lost,
    skipped: Math.max(0, requested - allRuns.length),
    passAt1: n ? c / n : 0,
    passAt1Lower: ci.lower,
    passAt1Upper: ci.upper,
    endToEnd: requested ? c / requested : 0,
    passPowK,
    passPowKLower,
    passAtK,
    meanSteps: n ? stepCounts.reduce((a, b) => a + b, 0) / n : 0,
    medianSteps: percentile(stepCounts, 0.5),
    p95Steps: percentile(stepCounts, 0.95),
    minSteps: stepCounts[0] ?? 0,
    maxSteps: stepCounts[stepCounts.length - 1] ?? 0,
    meanDurationMs: n ? durations.reduce((a, b) => a + b, 0) / n : 0,
    medianDurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    totalCostUsd: allRuns.reduce((s, r) => s + (r.usage.costUsd ?? 0), 0),
    costPerSuccessUsd: passedRuns.length ? costScored / passedRuns.length : null,
    costPerPassingRunUsd: passedRuns.length ? costPassed / passedRuns.length : null,
  };
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)) * 100) / 100;
}

/**
 * Re-derive pass/fail from the stored checks. Applied whenever a saved bench is
 * loaded, so a change in the grading rule (like no longer requiring the agent
 * to declare completion) applies uniformly to old results.
 */
export function regrade(runs: RunResult[]): void {
  for (const r of runs) {
    if (r.status === "errored") continue;
    if (r.checks.some((c) => c.errored)) { r.status = "errored"; r.errorKind = "verifier"; continue; }
    r.status = r.checks.length > 0 && r.checks.every((c) => c.passed) ? "passed" : "failed";
  }
}

/** Benches recorded before per-run cost capture get it backfilled from their token counts. */
export function backfillCosts(runs: RunResult[], model: string): void {
  for (const r of runs) {
    if (r.usage.costUsd === undefined) r.usage.costUsd = estimateCostUsd(model, r.usage.inputTokens, r.usage.outputTokens);
  }
}

/** Price per million tokens. Aliases move; the table is a best-effort default, override with PASSK_PRICE_IN/OUT. */
export const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-fable-5-1": { in: 10, out: 50 },
  "gpt-5.6": { in: 5, out: 30 },
  "gpt-5.6-sol": { in: 5, out: 30 },
  "gpt-5.6-terra": { in: 2, out: 12 },
  "gpt-5.6-luna": { in: 0.2, out: 1.2 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const envIn = process.env.PASSK_PRICE_IN, envOut = process.env.PASSK_PRICE_OUT;
  const price = envIn && envOut ? { in: Number(envIn), out: Number(envOut) } : PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, "")];
  if (!price) return undefined;
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
}
