import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runsForLowerBound, wilson } from "../src/metrics.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-rec-"));
process.env.PASSK_PROVIDER = "scripted";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");
process.env.PASSK_CLASSIFY = "0";

let runBench: typeof import("../src/runner.js").runBench;
let recommend: typeof import("../src/recommend.js").recommend;
let loadTask: typeof import("../src/config.js").loadTask;
before(async () => {
  ({ runBench } = await import("../src/runner.js"));
  ({ recommend } = await import("../src/recommend.js"));
  ({ loadTask } = await import("../src/config.js"));
});

test("feasibility: what an all-pass sample can establish", () => {
  assert.equal(runsForLowerBound(0.7), 9);
  assert.equal(runsForLowerBound(0.9), 35);
  assert.equal(runsForLowerBound(0.95), 73);
  assert.ok(wilson(10, 10).lower > 0.7);
});

test("recommend: false success claims point at state-based verification", async () => {
  process.env.PASSK_SCRIPT = "pass*7,claim_only*3";
  const { bench } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 10, noClassify: true });
  const r = recommend(bench);
  assert.match(r.observations.join(" "), /3 of them reported success anyway/);
  assert.match(r.next.join(" "), /reads state back/);
  assert.ok(r.keepFixed.includes("snapshot"));
});

test("recommend: an all-pass bench with a wide effort spread points at cost, not pass rate", async () => {
  process.env.PASSK_SCRIPT = "pass*4,slow";
  const { bench } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 10, noClassify: true });
  const r = recommend(bench);
  assert.match(r.observations.join(" "), /Effort varied from 8 to 30 steps/);
  assert.match(r.next.join(" "), /median steps and cost per success/);
});

test("a finished bench can be extended with a larger k on the same snapshot", async () => {
  process.env.PASSK_SCRIPT = "pass";
  const { bench, dir } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 5, noClassify: true });
  assert.equal(bench.status, "complete");
  await assert.rejects(runBench({ task: loadTask("tasks/fake.yaml"), k: 5, resumeDir: dir, noClassify: true }), /pass a larger --k/);
  const { bench: bigger } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 12, resumeDir: dir, noClassify: true });
  assert.equal(bigger.runs.length, 12);
  assert.equal(bigger.snapshotId, bench.snapshotId);
  assert.equal(bigger.k, 12);
});
