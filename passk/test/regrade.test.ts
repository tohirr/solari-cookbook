import { test } from "node:test";
import assert from "node:assert/strict";
import { regrade } from "../src/metrics.js";
import type { RunResult } from "../src/types.js";

const run = (status: RunResult["status"], checks: boolean[], stoppedBy: RunResult["stoppedBy"]): RunResult => ({
  runIndex: 0, sessionId: "", status, stoppedBy, startedAt: "", finishedAt: "", durationMs: 0, steps: [],
  checks: checks.map((passed) => ({ check: { type: "file_exists", path: "/x" }, passed })), usage: { inputTokens: 0, outputTokens: 0 },
});

test("a run that hit the step cap with all checks passing is a pass", () => {
  const runs = [run("failed", [true, true], "max_steps")];
  regrade(runs);
  assert.equal(runs[0].status, "passed");
});

test("a run that declared success with a failing check is a fail; errored stays errored; no checks is a fail", () => {
  const runs = [run("passed", [true, false], "end_turn"), run("errored", [], "error"), run("passed", [], "end_turn")];
  regrade(runs);
  assert.deepEqual(runs.map((r) => r.status), ["failed", "errored", "failed"]);
});
