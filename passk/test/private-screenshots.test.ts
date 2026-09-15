/**
 * `screenshots: private`. Some tasks drive a screen that carries real content
 * — a library of someone's saved posts — and those frames must not leave
 * runs/, while the numbers, the checks and the declared evidence files still
 * can. Nothing published may reference a frame that was not copied.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-private-"));
process.env.PASSK_PROVIDER = "scripted";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");

let runBench: typeof import("../src/runner.js").runBench;
let loadTask: typeof import("../src/config.js").loadTask;
let exportBench: typeof import("../src/export.js").exportBench;
let toInspectLog: typeof import("../src/inspect.js").toInspectLog;
let taskHash: typeof import("../src/provenance.js").taskHash;
before(async () => {
  ({ runBench } = await import("../src/runner.js"));
  ({ loadTask } = await import("../src/config.js"));
  ({ exportBench } = await import("../src/export.js"));
  ({ toInspectLog } = await import("../src/inspect.js"));
  ({ taskHash } = await import("../src/provenance.js"));
});


/** A frame per step and a final frame, where a real run would have left them. */
function plantFrames(dir: string, bench: { runs: { runIndex: number; steps: { index: number; screenshot?: string }[]; finalScreenshot?: string }[] }): void {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  for (const r of bench.runs) {
    const rd = path.join(dir, `run-${String(r.runIndex).padStart(2, "0")}`);
    for (const s of r.steps) {
      s.screenshot = `step-${String(s.index).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(rd, s.screenshot), png);
    }
    r.finalScreenshot = "final.png";
    fs.writeFileSync(path.join(rd, "final.png"), png);
    fs.writeFileSync(path.join(rd, "run.json"), JSON.stringify(r, null, 2));
  }
  fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
}

test("a private-screenshot bench exports its numbers and evidence, and no frame", async () => {
  process.env.PASSK_SCRIPT = "pass,fail,pass";
  const base = { ...loadTask("tasks/fake.yaml"), evidence: ["/tmp/target.txt"] };
  const { bench, dir } = await runBench({ task: { ...base, screenshots: "private" }, k: 3, noClassify: true });
  // The scripted desktop writes no frames, so put some where a real run leaves
  // them: this is a test of what export does with them, not of capture.
  plantFrames(dir, bench);

  const out = path.join(tmp, "evidence-private");
  const res = exportBench(dir, out);
  assert.equal(res.privateShots, true);
  assert.equal(res.files, 0, "no screenshot copied");
  assert.ok(res.evidence > 0, "declared evidence files are still exported");

  const copied = fs.readdirSync(out, { recursive: true }) as string[];
  assert.equal(copied.filter((f) => /\.(png|jpe?g)$/i.test(String(f))).length, 0, "no image in the exported folder");

  const exported = JSON.parse(fs.readFileSync(path.join(out, "bench.json"), "utf8")) as typeof bench;
  assert.ok(exported.runs.every((r) => !r.finalScreenshot && r.steps.every((s) => !s.screenshot)), "nothing references a frame");
  const html = fs.readFileSync(path.join(out, "report.html"), "utf8");
  assert.ok(!/<img[^>]+src="run-/.test(html), "the exported report shows no frame");
  assert.match(html, /3\/3|2\/3/, "it still reports the outcome");

  // --images cannot put back what the export refused.
  const log = JSON.stringify(toInspectLog(exported, dir, true));
  assert.ok(!log.includes("data:image"), "no frame is embedded in an Inspect log either");
});

test("a bench without the declaration still exports its proof frames", async () => {
  process.env.PASSK_SCRIPT = "pass,fail,pass";
  const { bench, dir } = await runBench({ task: loadTask("tasks/fake.yaml"), k: 3, noClassify: true });
  plantFrames(dir, bench);
  const res = exportBench(dir, path.join(tmp, "evidence-normal"));
  assert.equal(res.privateShots, false);
  assert.ok(res.files > 0, "the frames that carry proof are copied");
});

test("the declaration cannot change an outcome, so it is not in the task hash", () => {
  const task = loadTask("tasks/fake.yaml");
  assert.equal(taskHash({ ...task, screenshots: "private" }), taskHash(task));
});
