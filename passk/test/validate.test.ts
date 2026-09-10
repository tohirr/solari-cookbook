import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-validate-"));
process.env.PASSK_PROVIDER = "scripted";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");

let validateTask: typeof import("../src/validate.js").validateTask;
let loadTask: typeof import("../src/config.js").loadTask;
before(async () => {
  ({ validateTask } = await import("../src/validate.js"));
  ({ loadTask } = await import("../src/config.js"));
});

test("a sound task: checks fail untouched, pass after golden", async () => {
  const v = await validateTask(loadTask("tasks/fake.yaml"));
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.ok(v.golden?.every((c) => c.passed));
});

test("a vacuous check (passes before anyone acts) is reported", async () => {
  const t = loadTask("tasks/fake.yaml");
  t.checks = [{ type: "file_exists", path: "/tmp/target.txt" }];
  t.golden = [{ write: "/tmp/target.txt", content: "x" }];
  // Seed the state the check looks for by making the golden step run first is not possible here,
  // so simulate by asserting on a check that passes on an empty desktop: exec with no expectation.
  t.checks = [{ type: "exec", cmd: "true" }];
  const v = await validateTask(t);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /already passes before any agent acts/);
});

test("golden steps that do not satisfy the checks are reported", async () => {
  const t = loadTask("tasks/fake.yaml");
  t.golden = [{ write: "/tmp/target.txt", content: "not the word" }];
  const v = await validateTask(t);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /still fails after the golden steps/);
});

test("run records the validation it performed on the bench and in the report", async () => {
  const { runBench } = await import("../src/runner.js");
  const { renderReport } = await import("../src/report/html.js");
  process.env.PASSK_SCRIPT = "pass";
  const task = loadTask("tasks/fake.yaml");
  const v = await validateTask(task);
  const validation = { at: new Date().toISOString(), ok: true, notes: v.notes, problems: [] };
  const { bench, dir } = await runBench({ task, k: 2, concurrency: 2, noClassify: true, validation });
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "bench.json"), "utf8"));
  assert.deepEqual(saved.validation, validation);
  assert.match(renderReport(bench), /verifier validated before the bench: 1\/1 goal checks fail/);
  // A bench run without the check carries no claim about its verifier.
  const bare = await runBench({ task, k: 1, concurrency: 1, noClassify: true });
  assert.equal("validation" in bare.bench, false);
  assert.doesNotMatch(renderReport(bare.bench), /verifier validated/);
});
