#!/usr/bin/env tsx
/**
 * passk — does your computer-use agent pass twice?
 *
 *   passk prepare tasks/notes.yaml            boot, set up, snapshot
 *   passk probe   tasks/notes.yaml            find ambiguities before benching
 *   passk run     tasks/notes.yaml --k 5      fork ×5, run, check, report
 *   passk report  runs/<dir>                  re-render report.html from bench.json
 *   passk gate    runs/<dir> --require 0.9    exit 2 if a saved bench misses a threshold
 *   passk compare runs/<A> runs/<B>           what changed, what moved, and whether it could be noise
 *   passk classify runs/<dir>                 (re)run failure classification on a saved bench
 *   passk export  runs/<dir> evidence/<name>  copy a bench with only the screenshots that carry proof
 *   passk validate tasks/notes.yaml           prove the checks fail before and pass after the task's golden steps
 *   passk recommend runs/<dir>                what to change next, and what to keep fixed, from a finished bench
 *   passk doctor                              keys, Solari, a desktop boot, the model key, and what a run would use
 *   passk sweep                               kill every desktop tagged passk (after an interrupted bench)
 *   passk studio                              the leaderboard on localhost, with your keys and a Run button that works
 *
 * Exit codes: 0 ok, 1 usage or crash, 2 a --require threshold was not met.
 */
import fs from "node:fs";
import path from "node:path";
import { classifyFailures } from "./classify.js";
import { compareBenches, formatComparison, loadBench } from "./compare.js";
import { doctor } from "./doctor.js";
import { exportBench } from "./export.js";
import { recommendDir } from "./recommend.js";
import { validateTask } from "./validate.js";
import { renderCompare } from "./report/compare.js";
import { config, loadTask, readSnapshots } from "./config.js";
import { backfillCosts, computeMetrics, regrade, runsForLowerBound, wilson } from "./metrics.js";
import { prepareTask } from "./prepare.js";
import { probeTask } from "./probe.js";
import { renderReport } from "./report/html.js";
import { findLatest, findResumable, runBench } from "./runner.js";
import type { BenchResult } from "./types.js";

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const [cmd, target] = process.argv.slice(2);
  // --safety allow|deny overrides PASSK_SAFETY for this invocation.
  if (flag("safety")) process.env.PASSK_SAFETY = flag("safety");
  switch (cmd) {
    case "prepare": {
      await prepareTask(loadTask(must(target)));
      return;
    }
    case "probe": {
      const task = loadTask(must(target));
      const p = await probeTask(task);
      console.log(`\ninterpretation: ${p.interpretation}\nrisk: ${p.risk}\n`);
      for (const a of p.ambiguities) console.log(`? ${a.question}\n    why: ${a.why_it_matters}\n    default: ${a.default_assumption}\n`);
      return;
    }
    case "run": {
      const task = loadTask(must(target));
      const k = Number(flag("k", "5"));
      // --resume [dir]: continue a bench left in status "running". Without a dir, the newest such bench for this task.
      let resumeDir: string | undefined;
      if (has("resume")) {
        const given = flag("resume");
        resumeDir = given && !given.startsWith("--") && fs.existsSync(path.join(given, "bench.json")) ? given : findResumable(task.id) ?? findLatest(task.id);
        if (!resumeDir) { console.error(`nothing to resume or extend for "${task.id}"`); process.exit(1); }
      }
      // What this sample size can establish, said before spending.
      feasibility(k, flag("require-lower") ? Number(flag("require-lower")) : undefined);
      if (!resumeDir && !flag("snapshot") && (has("prepare") || !readSnapshots()[task.id])) await prepareTask(task);
      const { bench, dir } = await runBench({
        task, k, resumeDir,
        abortAfter: process.env.PASSK_ABORT_AFTER ? Number(process.env.PASSK_ABORT_AFTER) : undefined,
        concurrency: flag("concurrency") ? Number(flag("concurrency")) : undefined,
        // PASSK_CLASSIFY=0 turns the LLM failure classification off without the flag.
        noClassify: has("no-classify") || process.env.PASSK_CLASSIFY === "0",
        budgetUsd: flag("budget") ? Number(flag("budget")) : undefined,
        // Fork a specific snapshot instead of the task's own. This is how a paired
        // experiment holds the environment fixed while the prompt changes.
        snapshotId: flag("snapshot"),
      });
      printSummary(bench, k);
      console.log(`\nreport: ${path.join(dir, "report.html")}`);
      process.exitCode = enforce(bench);
      return;
    }
    case "compare": {
      const dirB = process.argv[4];
      if (!dirB) { console.error("compare needs two bench directories"); process.exit(1); }
      const c = compareBenches(must(target), dirB);
      console.log(formatComparison(c));
      const outDir = flag("out") ? path.resolve(flag("out")!) : path.join(config.runsDir, `compare-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "compare.json"), JSON.stringify(c, null, 2));
      fs.writeFileSync(path.join(outDir, "compare.html"), renderCompare(c, loadBench(c.a.dir), loadBench(c.b.dir), outDir));
      console.log(`\nreport: ${path.join(outDir, "compare.html")}`);
      return;
    }
    case "recommend": {
      console.log(recommendDir(must(target)));
      return;
    }
    case "validate": {
      const task = loadTask(must(target));
      if (!readSnapshots()[task.id] && !flag("snapshot")) await prepareTask(task);
      const v = await validateTask(task, flag("snapshot"));
      for (const n of v.notes) console.log(`  · ${n}`);
      for (const p of v.problems) console.log(`  ✗ ${p}`);
      console.log(v.ok ? `\n${task.id}: the verifier is sound` : `\n${task.id}: ${v.problems.length} problem${v.problems.length === 1 ? "" : "s"}`);
      process.exitCode = v.ok ? 0 : 2;
      return;
    }
    case "doctor": {
      process.exitCode = (await doctor()) ? 0 : 1;
      return;
    }
    case "studio": {
      const { startStudio } = await import("./studio.js");
      const { url } = await startStudio({ port: flag("port") ? Number(flag("port")) : undefined, open: !has("no-open") });
      console.log(`passk studio: ${url}\nkeys live in ${path.resolve(".env")}; runs land in runs/. Ctrl+C to stop.`);
      await new Promise(() => {});
      return;
    }
    case "sweep": {
      const { solari } = await import("./desktop.js");
      let n = 0;
      for await (const s of solari().sandboxes.listAll({})) {
        if (s.metadata?.app === "passk") { await solari().sandboxes.kill(s.sandboxId); n++; console.log(`killed ${s.metadata.task ?? "?"} run ${s.metadata.run ?? s.metadata.role ?? "?"}`); }
      }
      console.log(n ? `${n} killed` : "nothing tagged passk is running");
      return;
    }
    case "export": {
      const out = process.argv[4];
      if (!out) { console.error("export needs a source bench dir and a destination dir"); process.exit(1); }
      const { bench, files, bytes } = exportBench(must(target), out);
      console.log(`${bench.taskId}: ${bench.metrics.passed}/${bench.metrics.n} → ${out} (${files} screenshots, ${(bytes / 1e6).toFixed(1)} MB before compression)`);
      return;
    }
    case "classify": {
      // Classification is a separate, retryable step: it needs the model, and a
      // network blip during it should not cost a 50-run bench its hypotheses.
      const dir = must(target);
      const bench = loadBench(dir);
      bench.failures = await classifyFailures(bench.provenance?.task ?? { id: bench.taskId, name: bench.taskName, prompt: bench.prompt, checks: [] }, bench.runs, dir);
      fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
      fs.writeFileSync(path.join(dir, "report.html"), renderReport(bench));
      for (const f of bench.failures) console.log(`  run ${f.runIndex}: ${f.cause} (${f.confidence} confidence${f.divergenceStep !== null ? `, diverges @${f.divergenceStep}` : ""}) — ${f.explanation}`);
      return;
    }
    case "gate": {
      const bench = JSON.parse(fs.readFileSync(path.join(must(target), "bench.json"), "utf8")) as BenchResult;
      regrade(bench.runs);
      backfillCosts(bench.runs, bench.model);
      bench.metrics = computeMetrics(bench.runs, bench.k);
      printSummary(bench, bench.k);
      process.exitCode = enforce(bench);
      return;
    }
    case "report": {
      const dir = must(target);
      const bench = JSON.parse(fs.readFileSync(path.join(dir, "bench.json"), "utf8")) as BenchResult;
      // Metrics are cheap and their definition may have improved since the bench ran; recompute.
      regrade(bench.runs);
      backfillCosts(bench.runs, bench.model);
      bench.metrics = computeMetrics(bench.runs, bench.k);
      fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
      fs.writeFileSync(path.join(dir, "report.html"), renderReport(bench));
      console.log(`report: ${path.join(dir, "report.html")}`);
      return;
    }
    default:
      console.log(`usage:
  passk prepare <task.yaml>
  passk probe   <task.yaml>
  passk run     <task.yaml> [--k 5] [--concurrency 2] [--prepare] [--no-classify]
                            [--budget 1.00] [--require 0.9] [--require-lower 0.7] [--snapshot snap_…]
                            [--resume [runs/dir]]   finish an interrupted bench, or extend a finished one with a larger --k
                            [--safety deny|allow]   what to do when the model raises a safety check (default deny)
  passk report  <runs/dir>
  passk gate    <runs/dir> [--require 0.9] [--require-lower 0.7]
  passk compare <runs/A> <runs/B> [--out dir]
  passk export  <runs/dir> <evidence/dir>
  passk validate <task.yaml> [--snapshot snap_…]
  passk recommend <runs/dir>
  passk doctor
  passk sweep
  passk studio  [--port 8787] [--no-open]
  passk classify <runs/dir>

  --budget N         stop launching new runs once estimated model spend reaches $N
  --require P        exit 2 unless observed pass@1 >= P
  --require-lower P  exit 2 unless the 95% lower bound on pass@1 >= P (the stricter gate)`);
      process.exit(cmd ? 1 : 0);
  }
}

/**
 * Tell the user what k can prove before they pay for it. With --require-lower,
 * refuse a sample that cannot reach the requested bound even if every run passes.
 */
function feasibility(k: number, requireLower: number | undefined): void {
  const best = wilson(k, k).lower;
  console.log(`k=${k}: if every run passes, the 95% lower bound on the pass rate is ${(best * 100).toFixed(0)}%`);
  if (requireLower !== undefined && best < requireLower) {
    const need = runsForLowerBound(requireLower);
    console.error(`--require-lower ${requireLower} cannot be met with k=${k}: even ${k}/${k} gives ${(best * 100).toFixed(0)}%. About ${need} consecutive passes are needed. Raise --k or lower the requirement.`);
    process.exit(2);
  }
}

function printSummary(bench: BenchResult, k: number): void {
  const m = bench.metrics;
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  // pass^k for the k people actually ask about, not for k=n (which is 0 whenever anything failed).
  const ks = [5, 10].filter((x) => x <= m.n);
  if (!ks.length && m.n) ks.push(m.n);
  console.log(`\nobserved  ${m.passed}/${m.n} passed  (pass@1 ${pct(m.passAt1)}, 95% interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)})`);
  for (const kk of ks) console.log(`pass^${kk}${" ".repeat(Math.max(1, 6 - String(kk).length))}${pct(m.passPowK[kk] ?? 0)} estimated, lower bound ${pct(m.passPowKLower[kk] ?? 0)}`);
  if (m.errored || m.skipped) console.log(`end-to-end ${m.passed}/${m.requested} (lost: ${m.lost.solari} desktop, ${m.lost.provider} provider, ${m.lost.verifier} verifier; ${m.skipped} skipped for budget)`);
  console.log(`steps     median ${m.medianSteps}, p95 ${m.p95Steps}, range ${m.minSteps}–${m.maxSteps}`);
  console.log(`cost      $${m.totalCostUsd.toFixed(2)} total${m.costPerSuccessUsd !== null ? `, $${m.costPerSuccessUsd.toFixed(3)} per success` : ""}`);
  for (const f of bench.failures) console.log(`  run ${f.runIndex}: ${f.cause} (${f.confidence} confidence${f.divergenceStep !== null ? `, diverges @${f.divergenceStep}` : ""}) — ${f.explanation}`);
}

/** Threshold gate. Returns the process exit code. */
function enforce(bench: BenchResult): number {
  const m = bench.metrics;
  const req = flag("require"), reqLower = flag("require-lower");
  let code = 0;
  if (req !== undefined && m.passAt1 < Number(req)) { console.error(`\nFAIL: observed pass@1 ${(m.passAt1 * 100).toFixed(0)}% < required ${Number(req) * 100}%`); code = 2; }
  if (reqLower !== undefined && m.passAt1Lower < Number(reqLower)) { console.error(`\nFAIL: pass@1 lower bound ${(m.passAt1Lower * 100).toFixed(0)}% < required ${Number(reqLower) * 100}%`); code = 2; }
  return code;
}

function must(v: string | undefined): string {
  if (!v) { console.error("missing argument"); process.exit(1); }
  return v;
}

main().catch((err) => { console.error(err); process.exit(1); });
