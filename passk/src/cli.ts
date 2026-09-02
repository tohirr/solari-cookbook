#!/usr/bin/env tsx
/**
 * passk — does your computer-use agent pass twice?
 *
 *   passk prepare tasks/notes.yaml            boot, set up, snapshot
 *   passk probe   tasks/notes.yaml            find ambiguities before benching
 *   passk run     tasks/notes.yaml --k 5      fork ×5, run, check, report
 *   passk report  runs/<dir>                  re-render report.html from bench.json
 *   passk gate    runs/<dir> --require 0.9    exit 2 if a saved bench misses a threshold
 *
 * Exit codes: 0 ok, 1 usage or crash, 2 a --require threshold was not met.
 */
import fs from "node:fs";
import path from "node:path";
import { loadTask, readSnapshots } from "./config.js";
import { backfillCosts, computeMetrics } from "./metrics.js";
import { prepareTask } from "./prepare.js";
import { probeTask } from "./probe.js";
import { renderReport } from "./report/html.js";
import { runBench } from "./runner.js";
import type { BenchResult } from "./types.js";

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const [cmd, target] = process.argv.slice(2);
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
      if (has("prepare") || !readSnapshots()[task.id]) await prepareTask(task);
      const { bench, dir } = await runBench({
        task, k,
        concurrency: flag("concurrency") ? Number(flag("concurrency")) : undefined,
        // PASSK_CLASSIFY=0 turns the LLM failure classification off without the flag.
        noClassify: has("no-classify") || process.env.PASSK_CLASSIFY === "0",
        budgetUsd: flag("budget") ? Number(flag("budget")) : undefined,
      });
      printSummary(bench, k);
      console.log(`\nreport: ${path.join(dir, "report.html")}`);
      process.exitCode = enforce(bench);
      return;
    }
    case "gate": {
      const bench = JSON.parse(fs.readFileSync(path.join(must(target), "bench.json"), "utf8")) as BenchResult;
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
                            [--budget 1.00] [--require 0.9] [--require-lower 0.7]
  passk report  <runs/dir>
  passk gate    <runs/dir> [--require 0.9] [--require-lower 0.7]

  --budget N         stop launching new runs once estimated model spend reaches $N
  --require P        exit 2 unless observed pass@1 >= P
  --require-lower P  exit 2 unless the 95% lower bound on pass@1 >= P (the stricter gate)`);
      process.exit(cmd ? 1 : 0);
  }
}

function printSummary(bench: BenchResult, k: number): void {
  const m = bench.metrics;
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const kk = Math.min(k, m.n);
  console.log(`\nobserved  ${m.passed}/${m.n} passed  (pass@1 ${pct(m.passAt1)}, 95% interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)})`);
  console.log(`pass^${kk}    ${pct(m.passPowK[kk] ?? 0)} estimated, lower bound ${pct(m.passPowKLower[kk] ?? 0)}`);
  if (m.errored || m.skipped) console.log(`end-to-end ${m.passed}/${m.requested} (${m.errored} infra error${m.errored === 1 ? "" : "s"}, ${m.skipped} skipped for budget)`);
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
