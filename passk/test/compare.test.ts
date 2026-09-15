import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareBenches, fisherExact, formatComparison, loadBench } from "../src/compare.js";
import { computeMetrics } from "../src/metrics.js";
import { renderCompare } from "../src/report/compare.js";
import type { BenchResult, Check, RunResult } from "../src/types.js";

test("Fisher exact: identical splits give p = 1", () => {
  assert.equal(fisherExact(5, 0, 5, 0), 1);
  assert.ok(Math.abs(fisherExact(3, 2, 3, 2) - 1) < 1e-9);
});

test("Fisher exact: 3/10 vs 9/10 is unlikely to be noise; 4/10 vs 9/10 and 4/5 vs 5/5 are not", () => {
  assert.ok(Math.abs(fisherExact(3, 7, 9, 1) - 0.0198) < 0.001);
  // A reminder of how little ten-vs-ten can prove: this reads as a big jump and still clears 0.05.
  assert.ok(Math.abs(fisherExact(4, 6, 9, 1) - 0.0573) < 0.001);
  assert.ok(Math.abs(fisherExact(4, 1, 5, 0) - 1) < 1e-9);
});

test("Fisher exact matches a textbook value (tea tasting: 3,1,1,3 → 0.486)", () => {
  assert.ok(Math.abs(fisherExact(3, 1, 1, 3) - 0.4857) < 0.001);
});

/**
 * A by-check row is a sample of the same size as the bench, so it carries the
 * same uncertainty. 5/10 against 2/10 is a 30-point delta and nothing like a
 * result; the table has to say so where the delta is, not in a footnote.
 */
test("each by-check row carries both intervals and its own Fisher p", () => {
  const checks: Check[] = [
    { type: "exec", cmd: "c", args: ["a"], name: "hateful target removed", stdout_contains: "OK" },
    { type: "exec", cmd: "c", args: ["b"], name: "film scene kept", stdout_contains: "OK" },
  ];

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-compare-"));
  const bench = (dir: string, firstPasses: number) => {
    const runs: RunResult[] = Array.from({ length: 10 }, (_, i) => ({
      runIndex: i, sessionId: `s${i}`, status: "failed" as const, stoppedBy: "end_turn" as const,
      startedAt: "2026-09-10T00:00:00Z", finishedAt: "2026-09-10T00:01:00Z", durationMs: 60000,
      steps: [{ index: 0, name: "screenshot", input: {}, startedAt: "2026-09-10T00:00:00Z", durationMs: 1 }],
      checks: [{ check: checks[0], passed: i < firstPasses }, { check: checks[1], passed: true }],
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.01 },
    }));
    const b: BenchResult = {
      status: "complete", taskId: "t", taskName: "T", prompt: "p", model: "m", snapshotId: "snap", k: 10,
      startedAt: "2026-09-10T00:00:00Z", finishedAt: "2026-09-10T00:05:00Z", runs, metrics: computeMetrics(runs, 10), failures: [],
      provenance: { passkVersion: "t", gitCommit: null, provider: "scripted", model: "m", effort: "high", concurrency: 1, node: "t", packages: {}, taskHash: "h", task: { id: "t", name: "T", prompt: "p", checks }, budgetUsd: null },
    };
    const d = path.join(tmp, dir);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "bench.json"), JSON.stringify(b));
    return d;
  };
  const a = bench("a", 2), b = bench("b", 5);

  const c = compareBenches(a, b);
  const row = c.checks!.find((x) => x.label === "hateful target removed")!;
  assert.deepEqual([row.a.passed, row.b.passed], [2, 5]);
  assert.ok(row.a.lower < 0.06 && row.a.upper > 0.5, `A interval ${row.a.lower}–${row.a.upper}`);
  assert.ok(row.b.lower < 0.25 && row.b.upper > 0.75, `B interval ${row.b.lower}–${row.b.upper}`);
  assert.ok(row.fisherP > 0.3, `a 30-point delta on 10-vs-10 is not a result: p=${row.fisherP}`);

  const text = formatComparison(c);
  assert.ok(text.includes("2/10 (6%–51%)") && text.includes("5/10 (24%–76%)"), text);
  assert.ok(/p=0\.\d\d/.test(text), "each row prints its own p");
  const html = renderCompare(c, loadBench(a), loadBench(b), tmp);
  assert.ok(html.includes("6%–51%") && html.includes("24%–76%"), "the page shows the same intervals");
});
