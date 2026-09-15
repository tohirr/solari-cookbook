/**
 * Task-declared evidence files, and the runs that give up early: the two
 * things a bench used to lose. The evidence lived only inside a VM that was
 * already killed; the quitter was recorded as a clean end_turn and looked
 * exactly like a run that tried.
 *
 * Scripted provider, in-memory desktops: the real runner, checker, metrics and
 * export.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-evidence-"));
process.env.PASSK_PROVIDER = "scripted";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");
process.env.PASSK_CLASSIFY = "0";
process.env.PASSK_CONCURRENCY = "4";

let runBench: typeof import("../src/runner.js").runBench;
let loadTask: typeof import("../src/config.js").loadTask;
let exportBench: typeof import("../src/export.js").exportBench;
let renderReport: typeof import("../src/report/html.js").renderReport;
before(async () => {
  ({ runBench } = await import("../src/runner.js"));
  ({ loadTask } = await import("../src/config.js"));
  ({ exportBench } = await import("../src/export.js"));
  ({ renderReport } = await import("../src/report/html.js"));
});

test("every run keeps the files its task declared, and says so when one is missing", async () => {
  process.env.PASSK_SCRIPT = "pass";
  const task = { ...loadTask("tasks/fake.yaml"), evidence: ["/tmp/target.txt", "/root/app/state.json"] };
  const { bench, dir } = await runBench({ task, k: 2, noClassify: true });

  for (const r of bench.runs) {
    const [kept, missing] = r.evidence ?? [];
    assert.equal(kept.file, "evidence/target.txt");
    assert.equal(kept.bytes, 6);
    assert.equal(fs.readFileSync(path.join(dir, `run-0${r.runIndex}`, kept.file!), "utf8"), "magic\n");
    assert.equal(missing.file, undefined);
    assert.match(missing.error ?? "", /ENOENT/);
  }

  // The bench a reader opens carries them, and so does an exported copy.
  const html = renderReport(bench);
  assert.ok(html.includes("run-00/evidence/target.txt"), "the report links the file");
  assert.ok(html.includes("/root/app/state.json"), "and names the one that was not there");
  const out = path.join(tmp, "exported");
  const res = exportBench(dir, out);
  assert.equal(res.evidence, 2, "one kept file per run");
  assert.equal(fs.readFileSync(path.join(out, "run-00", "evidence", "target.txt"), "utf8"), "magic\n");
});

test("a run that stops on its own far under the bench's median effort is marked as stopping early", async () => {
  // slow passes in 30 steps; claim_only stops itself after 6 with nothing done.
  process.env.PASSK_SCRIPT = "slow*8,claim_only*2";
  const { bench } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 10, noClassify: true });
  const m = bench.metrics;
  assert.equal(m.medianSteps, 30);
  assert.equal(m.earlyQuitSteps, 7, "a quarter of the median");
  assert.deepEqual(m.earlyQuits, [8, 9]);
  assert.equal(m.passed, 8, "the quitters are failures, and still only failures");

  const html = renderReport(bench);
  assert.ok(html.includes("stopped early"), "the runs carry the mark");
  assert.ok(html.includes("a quarter of this bench's median effort"), "and the report says what it means");
});

test("a bench with no typical effort to compare against makes no such claim", async () => {
  process.env.PASSK_SCRIPT = "claim_only";
  const { bench } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 3, noClassify: true });
  assert.equal(bench.metrics.earlyQuitSteps, 0, "6 steps is the median here, not an outlier");
  assert.deepEqual(bench.metrics.earlyQuits, []);
});
