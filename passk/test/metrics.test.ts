import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, estimateCostUsd, percentile, wilson } from "../src/metrics.js";
import type { RunResult } from "../src/types.js";

const run = (status: RunResult["status"], steps = 5, cost = 0.01): RunResult => ({
  runIndex: 0, sessionId: "s", status, startedAt: "", finishedAt: "", durationMs: 1000,
  steps: Array.from({ length: steps }, (_, i) => ({ index: i, name: "click", input: {}, startedAt: "", durationMs: 1 })),
  checks: [], usage: { inputTokens: 1000, outputTokens: 10, costUsd: cost },
});

test("pass^k and pass@k are the unbiased estimators, not (c/n)^k", () => {
  const m = computeMetrics([run("passed"), run("passed"), run("passed"), run("passed"), run("failed")]);
  assert.equal(m.passAt1, 0.8);
  assert.equal(m.passPowK[2], 6 / 10);          // C(4,2)/C(5,2)
  assert.equal(m.passPowK[5], 0);               // can't get 5 passes from 4
  assert.equal(m.passAtK[2], 1);                // C(1,2)=0 → 1
  assert.ok(Math.abs(m.passPowK[3] - 4 / 10) < 1e-12); // C(4,3)/C(5,3)
});

test("10/10 is not 100% certain: Wilson lower bound sits near 72%", () => {
  const { lower, upper } = wilson(10, 10);
  assert.ok(lower > 0.71 && lower < 0.73, `lower=${lower}`);
  assert.equal(upper, 1);
  const m = computeMetrics(Array.from({ length: 10 }, () => run("passed")));
  assert.equal(m.passAt1, 1);
  assert.ok(m.passPowKLower[10] < 0.05, "pass^10 lower bound should be small on n=10");
});

test("infra errors are reported, excluded from pass@1, but counted end-to-end", () => {
  const infra = { ...run("errored", 0), error: "did not become ready" };
  const m = computeMetrics([run("passed"), run("passed"), infra], 3);
  assert.equal(m.n, 2);
  assert.equal(m.errored, 1);
  assert.equal(m.passAt1, 1);
  assert.equal(m.endToEnd, 2 / 3);
});

test("an errored run that took steps is an agent failure, not infra", () => {
  const m = computeMetrics([run("passed"), run("errored", 4)]);
  assert.equal(m.n, 2);
  assert.equal(m.errored, 0);
  assert.equal(m.passAt1, 0.5);
});

test("budget skips show up in requested vs attempted", () => {
  const m = computeMetrics([run("passed"), run("passed")], 5);
  assert.equal(m.skipped, 3);
  assert.equal(m.endToEnd, 2 / 5);
});

test("step and cost summaries", () => {
  const m = computeMetrics([run("passed", 8, 0.02), run("passed", 24, 0.05), run("failed", 30, 0.06)]);
  assert.equal(m.minSteps, 8);
  assert.equal(m.maxSteps, 30);
  assert.equal(m.medianSteps, 24);
  assert.ok(Math.abs(m.totalCostUsd - 0.13) < 1e-9);
  // 0.13 of scored spend bought 2 successes; the failed run's 0.06 is part of the price.
  assert.ok(Math.abs((m.costPerSuccessUsd ?? 0) - 0.065) < 1e-9);
  assert.ok(Math.abs((m.costPerPassingRunUsd ?? 0) - 0.035) < 1e-9);
});

test("percentile interpolates and handles empties", () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 1), 4);
});

test("cost estimate uses the price table and env override", () => {
  assert.ok(Math.abs((estimateCostUsd("gpt-5.6-luna", 1_000_000, 0) ?? 0) - 0.2) < 1e-9);
  assert.equal(estimateCostUsd("made-up-model", 1000, 10), undefined);
  process.env.PASSK_PRICE_IN = "1"; process.env.PASSK_PRICE_OUT = "2";
  assert.ok(Math.abs((estimateCostUsd("made-up-model", 1_000_000, 1_000_000) ?? 0) - 3) < 1e-9);
  delete process.env.PASSK_PRICE_IN; delete process.env.PASSK_PRICE_OUT;
});
