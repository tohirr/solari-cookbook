import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { loadBench } from "../src/compare.js";
import { inspectLogName, toInspectLog } from "../src/inspect.js";

type Loose = Record<string, any>;

test("export-inspect: one sample per run, epochs from the run index, lost runs carry an error and no score", () => {
  // ticket-routing requested 20 runs and lost two to infrastructure, so both paths are exercised.
  const dir = path.resolve("evidence/ticket-routing");
  const b = loadBench(dir);
  const log = toInspectLog(b, dir) as Loose;
  assert.equal(log.version, 2);
  assert.equal(log.status, "success");
  assert.equal(log.eval.task, b.taskId);
  assert.equal(log.eval.config.epochs, b.k);
  assert.equal(log.samples.length, b.runs.length);
  assert.deepEqual(log.samples.map((s: Loose) => s.epoch), b.runs.map((r) => r.runIndex + 1));
  const lost = log.samples.filter((s: Loose) => s.error), scored = log.samples.filter((s: Loose) => s.scores);
  assert.equal(lost.length, b.metrics.errored);
  assert.equal(scored.length, b.metrics.n);
  assert.ok(lost.every((s: Loose) => !s.scores), "a lost run is unscored, not a failure");
  assert.equal(scored.filter((s: Loose) => s.scores.checks.value === "C").length, b.metrics.passed);
  assert.equal(log.results.scores[0].metrics.accuracy.value, b.metrics.passAt1);
  assert.equal(log.results.scores[0].scored_samples, b.metrics.n);
  const s0 = scored[0];
  assert.equal(s0.messages[0].role, "user");
  assert.equal(s0.messages[0].content, b.prompt.trim());
  assert.ok(s0.messages.some((m: Loose) => m.role === "assistant" && m.tool_calls?.length), "every step is a tool call");
  assert.ok(s0.messages.some((m: Loose) => m.role === "tool"), "with a tool result");
  assert.ok(!JSON.stringify(log).includes("data:image"), "screenshots stay on disk unless --images");
  assert.match(inspectLogName(b), /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\+00-00_ticket-routing_[\w-]+\.json$/, "named the way inspect view lists logs");
});
