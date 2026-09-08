/**
 * Generate studio/data.json: everything the static studio shows,
 * read from the exported benches, comparisons and task files. The studio is
 * a view over the evidence folder, so it cannot say anything the evidence
 * does not; regenerate it whenever the evidence changes.
 *
 *   npx tsx scripts/studio-data.ts [evidenceDir]
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { Comparison } from "../src/compare.js";
import { PRICES } from "../src/metrics.js";
import type { BenchMetrics, BenchResult, Check, Task } from "../src/types.js";

export interface StudioTask {
  id: string; name: string; yaml: string; prompt: string; checks: Check[]; hasGolden: boolean; maxSteps: number | null; template: string;
}
export interface StudioRun {
  runIndex: number; status: string; steps: number; errorKind?: string; stoppedBy?: string; costUsd?: number; durationMs: number;
}
export interface StudioBench {
  dir: string; taskId: string; taskName: string; model: string; provider: string | null; effort: string | null; k: number;
  startedAt: string; status: string; prompt: string; taskHash: string | null; metrics: BenchMetrics; runs: StudioRun[];
  failures: { runIndex: number; cause: string; confidence: string; explanation: string }[];
}
export interface StudioCompare {
  dir: string; a: { dir: string; taskName: string }; b: { dir: string; taskName: string };
  changed: string[]; heldFixed: string[]; warnings: string[]; powK: number; fisherP: number;
  passes: { a: string; b: string }; delta: Comparison["delta"];
}
export interface StudioData {
  generatedAt: string; evidenceDir: string; tasks: StudioTask[]; benches: StudioBench[]; compares: StudioCompare[];
  /** Models with a known price, so the planner can offer them; those without a bench are marked untested in the UI. */
  models: string[];
}

export function studioData(evidenceDir = "evidence", tasksDir = "tasks"): StudioData {
  const EV = path.resolve(evidenceDir);
  const dirs = fs.existsSync(EV) ? fs.readdirSync(EV).sort() : [];
  const benches: StudioBench[] = [];
  const compares: StudioCompare[] = [];
  for (const d of dirs) {
    const bj = path.join(EV, d, "bench.json"), cj = path.join(EV, d, "compare.json");
    if (fs.existsSync(bj)) {
      const b = JSON.parse(fs.readFileSync(bj, "utf8")) as BenchResult;
      benches.push({
        dir: d, taskId: b.taskId, taskName: b.taskName, model: b.model, provider: b.provenance?.provider ?? null, effort: b.provenance?.effort ?? null,
        k: b.k, startedAt: b.startedAt, status: b.status ?? "complete", prompt: b.prompt.trim(), taskHash: b.provenance?.taskHash ?? null, metrics: b.metrics,
        runs: b.runs.map((r) => ({ runIndex: r.runIndex, status: r.status, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy, costUsd: r.usage.costUsd, durationMs: r.durationMs })),
        failures: b.failures.map((f) => ({ runIndex: f.runIndex, cause: f.cause, confidence: f.confidence, explanation: f.explanation })),
      });
    } else if (fs.existsSync(cj)) {
      const c = JSON.parse(fs.readFileSync(cj, "utf8")) as Comparison;
      compares.push({
        dir: d, a: { dir: path.basename(c.a.dir), taskName: c.a.taskName }, b: { dir: path.basename(c.b.dir), taskName: c.b.taskName },
        changed: c.changed, heldFixed: c.heldFixed, warnings: c.warnings, powK: c.powK ?? Math.max(1, Math.min(5, c.a.metrics.n, c.b.metrics.n)), fisherP: c.fisherP,
        passes: { a: `${c.a.metrics.passed}/${c.a.metrics.n}`, b: `${c.b.metrics.passed}/${c.b.metrics.n}` }, delta: c.delta,
      });
    }
  }
  const TD = path.resolve(tasksDir);
  const tasks: StudioTask[] = (fs.existsSync(TD) ? fs.readdirSync(TD).filter((f) => f.endsWith(".yaml")).sort() : []).map((f) => {
    const yaml = fs.readFileSync(path.join(TD, f), "utf8");
    const t = parse(yaml) as Task;
    return { id: t.id, name: t.name, yaml, prompt: (t.prompt ?? "").trim(), checks: t.checks ?? [], hasGolden: !!t.golden?.length, maxSteps: t.max_steps ?? null, template: t.template ?? "default" };
  }).filter((t) => t.id !== "fake");
  // A bench whose task file is gone still deserves a card: synthesise the task from the bench.
  for (const b of benches) if (!tasks.some((t) => t.id === b.taskId)) tasks.push({ id: b.taskId, name: b.taskName, yaml: "", prompt: b.prompt, checks: [], hasGolden: false, maxSteps: null, template: "?" });
  const models = Array.from(new Set([...benches.map((b) => b.model), ...Object.keys(PRICES)])).filter((m) => m !== "scripted").sort();
  return { generatedAt: new Date().toISOString(), evidenceDir: path.relative(process.cwd(), EV), tasks, benches, compares, models };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const data = studioData(process.argv[2]);
  const out = path.resolve("studio/data.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(`${out}: ${data.tasks.length} tasks, ${data.benches.length} benches, ${data.compares.length} comparisons`);
}
