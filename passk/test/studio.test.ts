/**
 * The studio end to end on the scripted provider: the board renders, keys
 * are reported by presence only, a run started from the API becomes a local
 * row when the child process finishes, and reports are served.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startStudio, writeEnv } from "../src/studio.js";

test("studio: scripted run from the API becomes a local row", { timeout: 120_000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-studio-"));
  const runsDir = path.join(tmp, "runs");
  process.env.PASSK_STATE_DIR = path.join(tmp, "state");
  process.env.PASSK_SCRIPT = "pass*3,fail";
  const { url, close } = await startStudio({ port: 0, open: false, runsDir, evidenceDir: path.resolve("evidence") });
  try {
    const page = await (await fetch(url)).text();
    assert.match(page, /passk<\/a>|studio · local/);
    assert.doesNotMatch(page, /slr_live_[A-Za-z0-9]{8}/, "no key value in the page");

    const state = await (await fetch(`${url}api/state`)).json();
    assert.ok(Array.isArray(state.shapes) && state.shapes.length >= 5);
    for (const v of Object.values(state.keys)) assert.equal(typeof v, "boolean");

    const bad = await fetch(`${url}api/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "../etc/passwd", model: "scripted", k: 2 }) });
    assert.equal(bad.status, 400);

    const started = await fetch(`${url}api/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "fake", model: "scripted", k: 4, concurrency: 4, budget: 1 }) });
    const startedText = await started.text();
    assert.equal(started.status, 200, startedText);
    const job = JSON.parse(startedText);
    assert.equal(job.status, "running");

    let done: { status: string; href?: string; error?: string; progress?: { done: number; passed: number } } | undefined;
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await (await fetch(`${url}api/state`)).json();
      done = s.jobs.find((j: { id: string }) => j.id === job.id);
      if (done && done.status !== "running") break;
    }
    assert.ok(done, "job listed");
    assert.equal(done.status, "done", done.error);
    assert.equal(done.progress?.done, 4);
    assert.equal(done.progress?.passed, 3);

    const report = await fetch(new URL(done.href!, url));
    assert.equal(report.status, 200);
    assert.match(await report.text(), /Scripted harness test/);

    const outside = await fetch(`${url}runs/../package.json`);
    assert.notEqual(outside.status, 200);
  } finally {
    await close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("studio: writeEnv replaces a key in place, appends a new one, keeps the rest", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "passk-env-")), ".env");
  fs.writeFileSync(f, "# keys\nSOLARI_API_KEY=slr_live_old\nPASSK_CONCURRENCY=2\n# OPENAI_API_KEY=sk-...\n");
  writeEnv(f, [["SOLARI_API_KEY", "slr_live_new"], ["ANTHROPIC_API_KEY", "sk-ant-x"]]);
  const out = fs.readFileSync(f, "utf8");
  assert.equal(out, "# keys\nSOLARI_API_KEY=slr_live_new\nPASSK_CONCURRENCY=2\n# OPENAI_API_KEY=sk-...\nANTHROPIC_API_KEY=sk-ant-x\n");
  writeEnv(f, [["OPENAI_API_KEY", "sk-real"]]);
  assert.match(fs.readFileSync(f, "utf8"), /^OPENAI_API_KEY=sk-real$/m, "a commented placeholder line is replaced, not duplicated");
  assert.equal((fs.statSync(f).mode & 0o777), 0o600);
});
