/**
 * Harness tests under injected faults. No Solari, no model: the scripted
 * provider drives in-memory desktops through the real runner, checker,
 * metrics and persistence.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-"));
process.env.PASSK_PROVIDER = "scripted";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");
process.env.PASSK_CLASSIFY = "0";
process.env.PASSK_CONCURRENCY = "4";

let runBench: typeof import("../src/runner.js").runBench;
let findResumable: typeof import("../src/runner.js").findResumable;
let loadTask: typeof import("../src/config.js").loadTask;
let executed: number[];
let fakeRegistry: Map<string, { killed: boolean }>;
before(async () => {
  ({ runBench, findResumable } = await import("../src/runner.js"));
  ({ loadTask } = await import("../src/config.js"));
  ({ executed } = await import("../src/agent/scripted.js"));
  ({ fakeRegistry } = await import("../src/fake/desktop.js"));
});
const task = () => loadTask("tasks/fake.yaml");

test("a bench that dies halfway resumes without running any index twice", async () => {
  process.env.PASSK_SCRIPT = "pass*15,fail*3,hang,claim_only";
  executed.length = 0;
  await assert.rejects(runBench({ task: task(), k: 20, abortAfter: 10, noClassify: true }), /simulated crash/);
  const dir = findResumable("fake");
  assert.ok(dir, "a running bench should be resumable");
  const onDisk = fs.readdirSync(dir!).filter((d) => /^run-/.test(d)).length;
  assert.ok(onDisk >= 10, `expected at least 10 run dirs after the crash, saw ${onDisk}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir!, "bench.json"), "utf8"));
  assert.equal(manifest.status, "running");
  assert.ok(manifest.runs.length >= 10, "manifest should already hold the completed runs");

  const { bench } = await runBench({ task: task(), k: 20, resumeDir: dir, noClassify: true });
  assert.equal(bench.status, "complete");
  assert.equal(bench.runs.length, 20);
  assert.deepEqual([...new Set(executed)].length, executed.length, "no run index executed twice");
  assert.equal(executed.length, 20);
  assert.equal(bench.metrics.passed, 15);
  assert.equal(bench.metrics.n, 20);
  assert.equal(bench.runs.find((r) => r.runIndex === 18)!.stoppedBy, "max_steps");
  assert.equal(bench.runs.find((r) => r.runIndex === 19)!.status, "failed", "a claim with no state change is a failure");
  assert.ok(fs.existsSync(path.join(dir!, "report.html")));
  assert.equal(findResumable("fake"), undefined, "nothing left to resume");
});

test("every fake desktop is killed, including on error paths", async () => {
  process.env.PASSK_SCRIPT = "pass,provider_err,crash_after,hang";
  await runBench({ task: task(), k: 8, noClassify: true });
  const leaked = [...fakeRegistry.values()].filter((d) => !d.killed);
  assert.equal(leaked.length, 0, `${leaked.length} fake desktops never killed`);
});

test("stop reasons are recorded and a crash after completing the task still counts as a pass", async () => {
  process.env.PASSK_SCRIPT = "pass,fail,claim_only,hang,provider_err,crash_after,slow";
  const { bench } = await runBench({ task: task(), k: 7, noClassify: true });
  const by = Object.fromEntries(bench.runs.map((r) => [r.runIndex, r]));
  assert.equal(by[0].status, "passed");
  assert.equal(by[1].status, "failed");
  assert.equal(by[2].status, "failed");
  assert.equal(by[3].status, "failed"); assert.equal(by[3].stoppedBy, "max_steps");
  assert.equal(by[4].status, "errored"); assert.equal(by[4].errorKind, "provider"); assert.match(by[4].error!, /429/);
  assert.equal(by[5].status, "passed", "the state is right; the agent crashing afterwards is a behavior note");
  assert.equal(by[5].stoppedBy, "error");
  assert.equal(by[6].status, "passed"); assert.equal(by[6].steps.length, 30);
  // A provider outage is not the agent's reliability: lost, not scored, but counted end-to-end.
  assert.deepEqual(bench.metrics.lost, { solari: 0, provider: 1, verifier: 0 });
  assert.equal(bench.metrics.errored, 1);
  assert.equal(bench.metrics.n, 6);
  assert.equal(bench.metrics.passed, 3);
  assert.ok(Math.abs(bench.metrics.endToEnd - 3 / 7) < 1e-9);
});

test("a checker crash is a verifier loss, never an agent failure; a safety stop is a failure with its reason", async () => {
  process.env.PASSK_SCRIPT = "verifier_err,safety,pass";
  const { bench } = await runBench({ task: task(), k: 3, noClassify: true });
  const by = Object.fromEntries(bench.runs.map((r) => [r.runIndex, r]));
  assert.equal(by[0].status, "errored"); assert.equal(by[0].errorKind, "verifier");
  assert.ok(by[0].checks.some((c) => c.errored));
  assert.equal(by[1].status, "failed"); assert.equal(by[1].stoppedBy, "safety_check");
  assert.equal(by[2].status, "passed");
  assert.deepEqual(bench.metrics.lost, { solari: 0, provider: 0, verifier: 1 });
  assert.equal(bench.metrics.n, 2);
  assert.equal(bench.metrics.passed, 1);
});

test("the budget cap stops launching runs and the shortfall is reported", async () => {
  process.env.PASSK_SCRIPT = "pass";
  // A scripted pass is 8 steps × 1000 input tokens; at $12.50/M input that is $0.10 a run.
  process.env.PASSK_PRICE_IN = "12.5"; process.env.PASSK_PRICE_OUT = "0";
  const { bench } = await runBench({ task: task(), k: 30, budgetUsd: 0.5, concurrency: 1, noClassify: true });
  delete process.env.PASSK_PRICE_IN; delete process.env.PASSK_PRICE_OUT;
  assert.ok(bench.runs.length >= 5 && bench.runs.length <= 6, `expected ~5 runs under a $0.50 cap, got ${bench.runs.length}`);
  assert.equal(bench.metrics.requested, 30);
  assert.equal(bench.metrics.skipped, 30 - bench.runs.length);
  assert.ok(bench.metrics.endToEnd < 0.25);
});

test("200 runs at concurrency 16 complete with consistent accounting", async () => {
  process.env.PASSK_SCRIPT = "pass*9,fail";
  const t0 = Date.now();
  const { bench } = await runBench({ task: task(), k: 200, concurrency: 16, noClassify: true });
  assert.equal(bench.runs.length, 200);
  assert.equal(bench.metrics.passed, 180);
  assert.equal(bench.metrics.n, 200);
  assert.ok(Math.abs(bench.metrics.passAt1 - 0.9) < 1e-9);
  assert.ok(bench.metrics.passAt1Lower > 0.85 && bench.metrics.passAt1Lower < 0.9);
  assert.ok(Date.now() - t0 < 60_000, "200 fake runs should take seconds");
});
