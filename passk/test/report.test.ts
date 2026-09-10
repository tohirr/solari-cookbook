import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLabel } from "../src/checker.js";
import { dotsHtml, tailStat, wordDiffHtml } from "../src/report/theme.js";
import { renderReport } from "../src/report/html.js";
import { computeMetrics } from "../src/metrics.js";
import type { BenchResult, Check, RunResult } from "../src/types.js";

test("a tail statistic is only shown when the sample can carry it", () => {
  assert.equal(tailStat(5), null);
  assert.equal(tailStat(9), null);
  assert.deepEqual(tailStat(10), { label: "p90", p: 0.9 });
  assert.deepEqual(tailStat(19), { label: "p90", p: 0.9 });
  assert.deepEqual(tailStat(20), { label: "p95", p: 0.95 });
});

test("the prompt diff marks only the words that changed", () => {
  const html = wordDiffHtml("Save the ticket and verify it.", "Save the ticket, reload the page, and verify it.");
  assert.ok(html.includes("<del>ticket</del>") && html.includes("<ins>ticket, reload the page,</ins>"), html);
  assert.ok(!html.includes("<del>Save"), "unchanged words are not marked");
  assert.equal(wordDiffHtml("same words", "same words"), "same words");
  assert.ok(wordDiffHtml("a <b>", "a &").includes("&lt;b&gt;"), "escaped");
});

test("dots carry a glyph, a label, a link, and wrap into rows of ten past ten runs", () => {
  const runs = (n: number) => Array.from({ length: n }, (_, i) => ({ status: i === 3 ? "failed" : "passed", runIndex: i, steps: 5 }));
  const small = dotsHtml(runs(5), 0, "", (i) => `#run-${i}`);
  assert.equal((small.match(/class="dotrow"/g) ?? []).length, 1);
  assert.ok(small.includes(`href="#run-3"`) && small.includes(">×<") && small.includes(">✓<"));
  assert.ok(small.includes(`aria-label="run 3: failed in 5 steps"`));
  const big = dotsHtml(runs(23), 2);
  assert.equal((big.match(/class="dotrow"/g) ?? []).length, 3);
  assert.ok(big.includes("<em>10</em>") && big.includes("<em>20</em>"));
  assert.ok(!big.includes("<a "), "no links without an href");
});

test("a check is labelled by its name when it has one, else by what it does", () => {
  assert.equal(checkLabel({ type: "exec", cmd: "python3", args: ["/root/check.py"] }), "exec python3 /root/check.py");
  assert.equal(checkLabel({ type: "file_exists", path: "/a", name: "The file exists" }), "The file exists");
  assert.equal(checkLabel({ type: "screenshot_judge", rubric: "r" }), "screenshot_judge");
});

test("a multi-check task gets a Checks table, worst check first, guards marked; a one-check task does not", () => {
  const checks: Check[] = [
    { type: "exec", cmd: "c", args: ["a"], name: "routing right", stdout_contains: "OK" },
    { type: "exec", cmd: "c", args: ["b"], name: "date rule right", stdout_contains: "OK" },
    { type: "exec", cmd: "c", args: ["g"], name: "closed untouched", stdout_contains: "OK", invariant: true },
  ];
  const run = (i: number, results: boolean[]): RunResult => ({
    runIndex: i, sessionId: `s${i}`, status: results.every(Boolean) ? "passed" : "failed", stoppedBy: "end_turn",
    startedAt: "2026-09-10T00:00:00Z", finishedAt: "2026-09-10T00:01:00Z", durationMs: 60000,
    steps: [{ index: 0, name: "screenshot", input: {}, startedAt: "2026-09-10T00:00:00Z", durationMs: 1 }],
    checks: checks.map((c, j) => ({ check: c, passed: results[j] })), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.01 },
  });
  const runs = [run(0, [true, true, true]), run(1, [true, false, true]), run(2, [true, false, true]), run(3, [false, true, true])];
  const bench = (cs: Check[], rs: RunResult[]): BenchResult => ({
    status: "complete", taskId: "t", taskName: "T", prompt: "p", model: "m", snapshotId: "snap", k: rs.length,
    startedAt: "2026-09-10T00:00:00Z", finishedAt: "2026-09-10T00:05:00Z", runs: rs, metrics: computeMetrics(rs, rs.length), failures: [],
    provenance: { passkVersion: "t", gitCommit: null, provider: "scripted", model: "m", effort: "high", concurrency: 1, node: "t", packages: {}, taskHash: "h", task: { id: "t", name: "T", prompt: "p", checks: cs }, budgetUsd: null },
  });
  const html = renderReport(bench(checks, runs));
  assert.ok(html.includes("<h2>Checks</h2>"));
  const order = ["date rule right", "routing right", "closed untouched"].map((n) => html.indexOf(n));
  assert.ok(order[0] < order[1] && order[1] < order[2], "sorted by pass rate ascending");
  assert.ok(html.includes("2/4") && html.includes("3/4") && html.includes("4/4"));
  assert.ok(/closed untouched[^<]*<span class="pill inv">guard<\/span>/.test(html), "invariants are marked as guards");
  assert.ok(html.includes("2 of 3 checks failed in at least one run"));
  const one = renderReport(bench([checks[0]], runs.map((r) => ({ ...r, checks: [r.checks[0]] }))));
  assert.ok(!one.includes("<h2>Checks</h2>"), "a single check has nothing to tabulate");
});
