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
