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
import { destroyDesktop, forkDesktop, solari, withReconnect } from "./desktop.js";
import { computeMetrics, estimateCostUsd } from "./metrics.js";
import { collectProvenance } from "./provenance.js";
import { renderReport } from "./report/html.js";
import type { BenchResult, RunResult, Task } from "./types.js";

export interface RunBenchOptions {
  task: Task;
  k: number;
  concurrency?: number;
  snapshotId?: string;
  /** Skip the LLM failure classification (faster, cheaper). */
  noClassify?: boolean;
  /** Stop launching new runs once estimated model spend reaches this many dollars. */
  budgetUsd?: number;
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

  const concurrency = opts.concurrency ?? config.concurrency;
  const provenance = collectProvenance(task, concurrency, opts.budgetUsd ?? null);

  // Budget cap: a shared tally the workers consult before forking. Runs already
  // in flight finish; nothing new starts once the cap is reached.
  let spentUsd = 0;
  const budgetLeft = () => opts.budgetUsd === undefined || spentUsd < opts.budgetUsd;
  const runs = await mapLimit(range(k), concurrency, async (i) => {
    if (!budgetLeft()) { console.log(`[run ${i}] skipped: budget of $${opts.budgetUsd} reached ($${spentUsd.toFixed(2)} spent)`); return null; }
    const r = await runOne(task, snapshotId, i, dir);
    spentUsd += r.usage.costUsd ?? 0;
    return r;
  });
  const completed = runs.filter((r): r is RunResult => r !== null).sort((a, b) => a.runIndex - b.runIndex);

  await sweep(task.id);
  const metrics = computeMetrics(completed, k);
  const failures = opts.noClassify ? [] : await classifyFailures(task, completed, dir);

  const bench: BenchResult = {
    taskId: task.id, taskName: task.name, prompt: task.prompt, model: config.model,
    snapshotId, k, startedAt, finishedAt: new Date().toISOString(), runs: completed, metrics, failures, provenance,
  };
  fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
  fs.writeFileSync(path.join(dir, "report.html"), renderReport(bench));
  return { bench, dir };
}

/** Run indices currently holding a desktop in this process. Anything tagged with this task and not in here is a leak. */
const liveRuns = new Set<string>();

async function runOne(task: Task, snapshotId: string, runIndex: number, benchDir: string): Promise<RunResult> {
  const outDir = path.join(benchDir, `run-${String(runIndex).padStart(2, "0")}`);
  fs.mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const tag = `[run ${runIndex}]`;
  let desktop: Desktop | undefined;

  try {
    desktop = await forkWithRetry(snapshotId, task, runIndex, tag);
    liveRuns.add(String(runIndex));
    console.log(`${tag} forked → ${desktop.id}`);

    const agent = await runAgent({
      desktop, prompt: task.prompt, outDir, maxSteps: task.max_steps ?? 40,
      onStep: (s) => console.log(`${tag} #${s.index} ${s.name}${s.error ? "  ✗ " + s.error : ""}`),
    });

    const live = desktop;
    const finalPng = await withReconnect(live, () => live.screenshot({ format: "png" }));
    fs.writeFileSync(path.join(outDir, "final.png"), finalPng);
    const checks = await runChecks(desktop, task.checks, finalPng);
    // Outcome is judged by the checks alone. Whether the agent stopped on its
    // own, hit the cap, or crashed is recorded separately: it is a behavior
    // signal, not a verdict.
    const passed = checks.every((c) => c.passed);
    const status = agent.stoppedBy === "error" ? "errored" : passed ? "passed" : "failed";
    console.log(`${tag} ${status.toUpperCase()} in ${agent.steps.length} steps (${agent.stoppedBy})`);

    const result: RunResult = {
      runIndex, sessionId: desktop.id, status, startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(), durationMs: Date.now() - started, steps: agent.steps, checks,
      finalScreenshot: "final.png", finalMessage: agent.finalMessage, error: agent.error, stoppedBy: agent.stoppedBy,
      usage: { ...agent.usage, costUsd: estimateCostUsd(config.model, agent.usage.inputTokens, agent.usage.outputTokens) },
    };
    fs.writeFileSync(path.join(outDir, "run.json"), JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const message = (err as Error).message;
    console.error(`${tag} ERRORED: ${message}`);
    return {
      runIndex, sessionId: desktop?.id ?? "", status: "errored", startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(), durationMs: Date.now() - started, steps: [], checks: [],
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, error: message,
    };
  } finally {
    await destroyDesktop(desktop);
    liveRuns.delete(String(runIndex));
  }
}

/**
 * Fork with retries. Two transient failures are expected in the wild: a fork
 * that boots but never reports ready (host hiccup), and "Too many concurrent
 * sessions" while a just-killed sibling is still releasing its slot. Both are
 * worth a short wait and another try before the run is written off.
 */
async function forkWithRetry(snapshotId: string, task: Task, runIndex: number, tag: string): Promise<Desktop> {
  const opts = { resolution: task.resolution, metadata: { task: task.id, run: String(runIndex) } };
  const attempts = 4;
  for (let i = 1; ; i++) {
    try {
      return await forkDesktop(snapshotId, opts);
    } catch (err) {
      const msg = (err as Error).message;
      if (i >= attempts) throw err;
      const wait = /concurrent/i.test(msg) ? 30_000 : 5_000;
      // A concurrency error mid-bench usually means an earlier run's VM outlived
      // its teardown (a network blip at the wrong moment). Kill anything tagged
      // with this task that no live run owns before waiting.
      if (/concurrent/i.test(msg)) await killStale(task.id, tag);
      console.warn(`${tag} fork failed (${msg}); retry ${i}/${attempts - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function killStale(taskId: string, tag: string): Promise<void> {
  try {
    for await (const s of solari().sandboxes.listAll({ state: "running" })) {
      if (s.metadata?.app === "passk" && s.metadata?.task === taskId && !liveRuns.has(String(s.metadata?.run))) {
        await solari().sandboxes.kill(s.sandboxId);
        console.warn(`${tag} killed a leaked desktop from run ${s.metadata.run}`);
      }
    }
  } catch (err) {
    console.warn(`${tag} stale-session sweep failed: ${(err as Error).message}`);
  }
}

/**
 * Kill anything from this bench that is still running. Per-run teardown can
 * fail when the network drops at the wrong moment, and a leaked VM holds a
 * concurrency slot until its idle timeout, which breaks the next bench.
 */
async function sweep(taskId: string): Promise<void> {
  try {
    for await (const s of solari().sandboxes.listAll({ state: "running" })) {
      if (s.metadata?.app === "passk" && s.metadata?.task === taskId) {
        await solari().sandboxes.kill(s.sandboxId);
        console.warn(`sweep: killed leaked desktop for run ${s.metadata.run ?? "?"}`);
      }
    }
  } catch (err) {
    console.warn(`sweep failed: ${(err as Error).message}`);
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
