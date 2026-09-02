#!/usr/bin/env tsx
/**
 * passk — does your computer-use agent pass twice?
 *
 *   passk prepare tasks/notes.yaml            boot, set up, snapshot
 *   passk probe   tasks/notes.yaml            find ambiguities before benching
 *   passk run     tasks/notes.yaml --k 5      fork ×5, run, check, report
 *   passk report  runs/<dir>                  re-render report.html from bench.json
 */
import fs from "node:fs";
import path from "node:path";
import { loadTask, readSnapshots } from "./config.js";
import { computeMetrics } from "./metrics.js";
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
      });
      const m = bench.metrics;
      const kk = Math.min(k, m.n);
      console.log(`\npass@1 ${(m.passAt1 * 100).toFixed(0)}%  pass^${kk} ${((m.passPowK[kk] ?? 0) * 100).toFixed(0)}%  (${m.passed}/${m.n}${m.errored ? `, ${m.errored} infra error${m.errored > 1 ? "s" : ""} unscored` : ""})`);
      for (const f of bench.failures) console.log(`  run ${f.runIndex}: ${f.cause}${f.divergenceStep !== null ? ` @${f.divergenceStep}` : ""} — ${f.explanation}`);
      console.log(`\nreport: ${path.join(dir, "report.html")}`);
      return;
    }
    case "report": {
      const dir = must(target);
      const bench = JSON.parse(fs.readFileSync(path.join(dir, "bench.json"), "utf8")) as BenchResult;
      // Metrics are cheap and their definition may have improved since the bench ran; recompute.
      bench.metrics = computeMetrics(bench.runs);
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
  passk report  <runs/dir>`);
      process.exit(cmd ? 1 : 0);
  }
}

function must(v: string | undefined): string {
  if (!v) { console.error("missing argument"); process.exit(1); }
  return v;
}

main().catch((err) => { console.error(err); process.exit(1); });
