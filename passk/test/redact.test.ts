/**
 * `labels`: identifiers a bench publishes under a label. The evidence must
 * still say which labelled thing got which decision, and must never say
 * which real thing that was — in the bench, in its evidence files, or in the
 * report — and an identifier the map missed must stop the export.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-redact-"));
process.env.PASSK_PROVIDER = "scripted";
process.env.PASSK_RUNS_DIR = path.join(tmp, "runs");
process.env.PASSK_STATE_DIR = path.join(tmp, "state");

let runBench: typeof import("../src/runner.js").runBench;
let loadTask: typeof import("../src/config.js").loadTask;
let exportBench: typeof import("../src/export.js").exportBench;
let taskHash: typeof import("../src/provenance.js").taskHash;
let redactText: typeof import("../src/redact.js").redactText;
before(async () => {
  ({ runBench } = await import("../src/runner.js"));
  ({ loadTask } = await import("../src/config.js"));
  ({ exportBench } = await import("../src/export.js"));
  ({ taskHash } = await import("../src/provenance.js"));
  ({ redactText } = await import("../src/redact.js"));
});

const A = "2084154145146290246", B = "1844896946642878650", C = "1653451572116848660";
const LABELS = { [A]: "target 1 (sexual)", [B]: "target 6 (hateful)", [C]: "library post 40" };

/** A bench whose runs name real things the way the boxed bookmarx runs do: in evidence, check details, and the agent's own words. */
async function benchNamingThings(k: number) {
  process.env.PASSK_SCRIPT = "pass,fail";
  const task = { ...loadTask("tasks/fake.yaml"), evidence: ["/tmp/target.txt"] };
  const { bench, dir } = await runBench({ task, k, noClassify: true });
  for (const r of bench.runs) {
    const rd = path.join(dir, `run-${String(r.runIndex).padStart(2, "0")}`);
    fs.mkdirSync(path.join(rd, "evidence"), { recursive: true });
    fs.writeFileSync(path.join(rd, "evidence", "state.json"), JSON.stringify({ decisions: { [A]: "remove", [B]: "keep" }, clicks: [{ id: C }] }));
    r.evidence = [{ path: "/root/app/state.json", file: "evidence/state.json", bytes: 10 }];
    r.checks[0].detail = `exit 0, stdout "NO: removed beyond the targets: ${C}"`;
    r.finalMessage = `Removed ${A}, kept ${B}.`;
    fs.writeFileSync(path.join(rd, "run.json"), JSON.stringify(r, null, 2));
  }
  fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
  return { bench, dir };
}

test("with a labels map every identifier leaves as its label, in the bench, the evidence files and the report", async () => {
  const { dir } = await benchNamingThings(2);
  // One run carries the task-declared file; the other does not: the union covers both.
  fs.writeFileSync(path.join(dir, "run-00", "labels.json"), JSON.stringify({ [A]: LABELS[A], [B]: LABELS[B] }));
  const extra = path.join(tmp, "more-labels.json");
  fs.writeFileSync(extra, JSON.stringify({ [C]: LABELS[C] }));
  const out = path.join(tmp, "evidence-labelled");
  const res = exportBench(dir, out, { labels: extra });
  assert.equal(res.redacted, 6, "A and B in two final messages, C in two check details: six occurrences in the bench; the evidence files are rewritten but counted separately");
  const all = fs.readdirSync(out, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(out, f)).isFile()).map((f) => fs.readFileSync(path.join(out, f), "utf8")).join("\n");
  for (const id of [A, B, C]) assert.ok(!all.includes(id), `${id} does not appear anywhere exported`);
  for (const label of Object.values(LABELS)) assert.ok(all.includes(label), `${label} does`);
  const state = JSON.parse(fs.readFileSync(path.join(out, "run-00", "evidence", "state.json"), "utf8"));
  assert.deepEqual(state.decisions, { "target 1 (sexual)": "remove", "target 6 (hateful)": "keep" }, "a decisions map keyed by id is keyed by label, and still JSON");
  const exported = JSON.parse(fs.readFileSync(path.join(out, "bench.json"), "utf8"));
  assert.equal(exported.redacted, res.redacted);
  assert.ok(!fs.existsSync(path.join(out, "run-00", "labels.json")), "the map itself is never exported");
  assert.match(fs.readFileSync(path.join(out, "report.html"), "utf8"), /identifiers replaced by labels before publication/);
});

test("an identifier the map misses refuses the whole export", async () => {
  const { dir } = await benchNamingThings(1);
  const partial = path.join(tmp, "partial.json");
  fs.writeFileSync(partial, JSON.stringify({ [A]: LABELS[A], [B]: LABELS[B] })); // C is missing
  const out = path.join(tmp, "evidence-refused");
  assert.throws(() => exportBench(dir, out, { labels: partial }), (err: Error) => {
    assert.match(err.message, /export refused: 1 identifier not in the labels map/);
    assert.match(err.message, new RegExp(`${C}  \\(run-00/evidence/state.json, bench\\)`), "one identifier, every place it still appears");
    return true;
  });
  assert.ok(!fs.existsSync(path.join(out, "bench.json")), "nothing published");
});

test("without a map nothing is touched, and the declaration is not in the task hash", async () => {
  const { dir } = await benchNamingThings(1);
  const out = path.join(tmp, "evidence-plain");
  const res = exportBench(dir, out);
  assert.equal(res.redacted, 0);
  assert.ok(fs.readFileSync(path.join(out, "bench.json"), "utf8").includes(A));
  const task = loadTask("tasks/fake.yaml");
  assert.equal(taskHash({ ...task, labels: "/root/app/labels.json" }), taskHash(task));
});

test("redaction respects token boundaries and longer identifiers first", () => {
  assert.equal(redactText(`${A} ${A}0 x${A}`, LABELS), `target 1 (sexual) ${A}0 x${A}`);
  assert.equal(redactText("id 12345678901234567 and 123456789012345678", { "12345678901234567": "short", "123456789012345678": "long" }), "id short and long");
});
