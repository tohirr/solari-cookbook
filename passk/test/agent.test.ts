import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A custom agent on in-memory desktops: PASSK_AGENT makes it the agent whatever else is set.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-agent-"));
process.env.PASSK_AGENT = "test/fixtures/custom-agent.ts";
process.env.PASSK_FAKE = "1";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");
delete process.env.PASSK_PROVIDER;

let runBench: typeof import("../src/runner.js").runBench;
let loadTask: typeof import("../src/config.js").loadTask;
let config: typeof import("../src/config.js").config;
let loadCustomAgent: typeof import("../src/agent/custom.js").loadCustomAgent;
before(async () => {
  ({ runBench } = await import("../src/runner.js"));
  ({ loadTask, config } = await import("../src/config.js"));
  ({ loadCustomAgent } = await import("../src/agent/custom.js"));
});

test("PASSK_AGENT: the module is the agent, the checks stay hidden from it, and the bench records it", async () => {
  assert.equal(config.provider, "custom");
  // A custom agent may use any model or none: the bench's model is PASSK_MODEL if set (a local .env may set it), else "custom".
  const model = process.env.PASSK_MODEL ?? "custom";
  assert.equal(config.model, model);
  const { bench } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 3, concurrency: 3, noClassify: true });
  assert.equal(bench.metrics.passed, 3);
  assert.equal(bench.metrics.n, 3);
  assert.equal(bench.model, model);
  assert.match(bench.provenance.agent, /^custom: /);
  assert.ok(bench.runs.every((r) => r.steps.length === 4 && r.steps[3].name === "write"), "the trace is the agent's own");
  assert.ok(bench.runs.every((r) => r.finalMessage?.startsWith("Wrote the magic word")), "the claim is recorded");
  if (model === "custom") assert.equal(bench.runs[0].usage.costUsd, undefined, "no price is known for a custom model");
});

test("PASSK_AGENT: a module without the export, or a missing file, says so", async () => {
  await assert.rejects(loadCustomAgent("test/fixtures/not-an-agent.ts"), /must export runAgent\(opts\) or a default function; exports: version/);
  await assert.rejects(loadCustomAgent("test/fixtures/nope.ts"), /could not load/);
});
