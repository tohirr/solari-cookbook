/**
 * `passk run <task> --k N` — fork the snapshot N times, run the agent on each
 * fork with a concurrency cap, check every result, and write the bench.
 */
import fs from "node:fs";
import path from "node:path";
import type { Desktop } from "@solarisdk/sdk";
import { runAgent } from "./agent/index.js";
import { runChecks } from "./checker.js";
import { classifyFailures } from "./classify.js";
import { config, readSnapshots } from "./config.js";
import { destroyDesktop, forkDesktop } from "./desktop.js";
import { computeMetrics } from "./metrics.js";
import { renderReport } from "./report/html.js";
import type { BenchResult, RunResult, Task } from "./types.js";

export interface RunBenchOptions {
  task: Task;
  k: number;
  concurrency?: number;
  snapshotId?: string;
  /** Skip the LLM failure classification (faster, cheaper). */
  noClassify?: boolean;
}

export async function runBench(opts: RunBenchOptions): Promise<{ bench: BenchResult; dir: string }> {
  const { task, k } = opts;
  const snapshotId = opts.snapshotId ?? readSnapshots()[task.id];
  if (!snapshotId) throw new Error(`no snapshot for task "${task.id}" — run \`passk prepare\` first`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(config.runsDir, `${task.id}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const startedAt = new Date().toISOString();
  console.log(`bench ${task.id}: k=${k} concurrency=${opts.concurrency ?? config.concurrency} snapshot=${snapshotId}\n→ ${dir}`);

  const runs = await mapLimit(range(k), opts.concurrency ?? config.concurrency, (i) => runOne(task, snapshotId, i, dir));
  runs.sort((a, b) => a.runIndex - b.runIndex);

  const metrics = computeMetrics(runs);
  const failures = opts.noClassify ? [] : await classifyFailures(task, runs, dir);

  const bench: BenchResult = {
    taskId: task.id, taskName: task.name, prompt: task.prompt, model: config.model,
    snapshotId, k, startedAt, finishedAt: new Date().toISOString(), runs, metrics, failures,
  };
  fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
  fs.writeFileSync(path.join(dir, "report.html"), renderReport(bench));
  return { bench, dir };
}

async function runOne(task: Task, snapshotId: string, runIndex: number, benchDir: string): Promise<RunResult> {
  const outDir = path.join(benchDir, `run-${String(runIndex).padStart(2, "0")}`);
  fs.mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const tag = `[run ${runIndex}]`;
  let desktop: Desktop | undefined;

  try {
    desktop = await forkWithRetry(snapshotId, task, runIndex, tag);
    console.log(`${tag} forked → ${desktop.id}`);

    const agent = await runAgent({
      desktop, prompt: task.prompt, outDir, maxSteps: task.max_steps ?? 40,
      onStep: (s) => console.log(`${tag} #${s.index} ${s.name}${s.error ? "  ✗ " + s.error : ""}`),
    });

    const finalPng = await desktop.screenshot({ format: "png" });
    fs.writeFileSync(path.join(outDir, "final.png"), finalPng);
    const checks = await runChecks(desktop, task.checks, finalPng);
    const passed = checks.every((c) => c.passed) && agent.stoppedBy === "end_turn";
    const status = agent.stoppedBy === "error" ? "errored" : passed ? "passed" : "failed";
    console.log(`${tag} ${status.toUpperCase()} in ${agent.steps.length} steps (${agent.stoppedBy})`);

    const result: RunResult = {
      runIndex, sessionId: desktop.id, status, startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(), durationMs: Date.now() - started, steps: agent.steps, checks,
      finalScreenshot: "final.png", finalMessage: agent.finalMessage, usage: agent.usage, error: agent.error,
    };
    fs.writeFileSync(path.join(outDir, "run.json"), JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const message = (err as Error).message;
    console.error(`${tag} ERRORED: ${message}`);
    return {
      runIndex, sessionId: desktop?.id ?? "", status: "errored", startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(), durationMs: Date.now() - started, steps: [], checks: [],
      usage: { inputTokens: 0, outputTokens: 0 }, error: message,
    };
  } finally {
    await destroyDesktop(desktop);
  }
}

/** A fork that never reports ready is a host hiccup; try once more before giving up on the run. */
async function forkWithRetry(snapshotId: string, task: Task, runIndex: number, tag: string): Promise<Desktop> {
  const opts = { resolution: task.resolution, metadata: { task: task.id, run: String(runIndex) } };
  try {
    return await forkDesktop(snapshotId, opts);
  } catch (err) {
    console.warn(`${tag} fork failed (${(err as Error).message}); retrying once`);
    return forkDesktop(snapshotId, opts);
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
