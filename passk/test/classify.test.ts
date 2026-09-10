import { test } from "node:test";
import assert from "node:assert/strict";
import { divergencePoint } from "../src/classify.js";
import type { TraceStep } from "../src/types.js";

const step = (i: number, name: string, input: unknown = {}): TraceStep => ({ index: i, name, input, startedAt: "", durationMs: 1 });

test("identical traces have no divergence", () => {
  const a = [step(0, "screenshot"), step(1, "left_click", { coordinate: [100, 100] })];
  assert.equal(divergencePoint(a, a), null);
});

test("small coordinate jitter is not a divergence, a different action is", () => {
  const a = [step(0, "screenshot"), step(1, "left_click", { coordinate: [100, 100] }), step(2, "type", { text: "hello" })];
  const jitter = [step(0, "screenshot"), step(1, "left_click", { coordinate: [110, 95] }), step(2, "type", { text: "hello" })];
  assert.equal(divergencePoint(a, jitter), null);
  const other = [step(0, "screenshot"), step(1, "left_click", { coordinate: [100, 100] }), step(2, "key", { text: "ctrl+s" })];
  assert.equal(divergencePoint(a, other), 2);
});

test("a trace that is a strict prefix diverges at its end", () => {
  const a = [step(0, "screenshot"), step(1, "type", { text: "x" }), step(2, "key", { text: "Return" })];
  assert.equal(divergencePoint(a, a.slice(0, 2)), 2);
});

test("bench-wide action table lists every scored run with its counts, lost runs excluded", async () => {
  const { benchActionTable } = await import("../src/classify.js");
  const step = (name: string, i: number) => ({ index: i, name, input: {}, startedAt: "2026-09-10T00:00:00Z", durationMs: 1 });
  const base = { sessionId: "s", startedAt: "2026-09-10T00:00:00Z", finishedAt: "2026-09-10T00:00:01Z", durationMs: 1000, checks: [], usage: { inputTokens: 0, outputTokens: 0 } };
  const runs = [
    { ...base, runIndex: 0, status: "passed" as const, steps: [step("click", 0), step("click", 1), step("type", 2)] },
    { ...base, runIndex: 1, status: "failed" as const, steps: [step("scroll", 0)] },
    { ...base, runIndex: 2, status: "errored" as const, errorKind: "solari" as const, steps: [] },
  ];
  const t = benchActionTable(runs);
  assert.match(t, /run 0 passed {3}3 steps: click 2, type 1/);
  assert.match(t, /run 1 failed {3}1 steps: scroll 1/);
  assert.ok(!t.includes("run 2"), "lost runs are not evidence about strategy");
});
