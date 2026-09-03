/**
 * `passk run <task> --k N` — fork the snapshot N times, run the agent on each
 * fork with a concurrency cap, check every result, and write the bench.
 *
 * Persistence is incremental. A manifest (bench.json with status "running")
 * is written before the first fork, and rewritten after every run, so a
 * process that dies at run 43 of 50 leaves 43 verified runs on disk and
 * `--resume` finishes the other seven. Nothing is executed twice: a run index
 * with a run.json on disk is complete.
 */
import fs from "node:fs";
import path from "node:path";
import type { Desktop } from "@solarisdk/sdk";
import { runAgent } from "./agent/index.js";
import { runChecks } from "./checker.js";
import { classifyFailures } from "./classify.js";
import { config, readSnapshots } from "./config.js";
import { destroyDesktop, forkDesktop, isFake, solari, withReconnect } from "./desktop.js";
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
  /** Continue a bench directory left in status "running"; only missing run indices execute. */
  resumeDir?: string;
  /** Test hook: throw after this many runs complete in this invocation, as if the process died. */
  abortAfter?: number;
}

const runDirName = (i: number) => `run-${String(i).padStart(2, "0")}`;

/** Read whatever completed runs a bench directory already holds. */
export function readCompletedRuns(dir: string): RunResult[] {
  const out: RunResult[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry, "run.json");
    if (/^run-\d+$/.test(entry) && fs.existsSync(p)) out.push(JSON.parse(fs.readFileSync(p, "utf8")) as RunResult);
  }
  return out.sort((a, b) => a.runIndex - b.runIndex);
}

/** Newest bench directory for a task that is still in status "running", if any. */
export function findResumable(taskId: string): string | undefined {
  if (!fs.existsSync(config.runsDir)) return undefined;
  const dirs = fs.readdirSync(config.runsDir).filter((d) => d.startsWith(`${taskId}-`)).sort().reverse();
  for (const d of dirs) {
    const p = path.join(config.runsDir, d, "bench.json");
    if (!fs.existsSync(p)) continue;
    const b = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<BenchResult>;
    if (b.status === "running") return path.join(config.runsDir, d);
  }
  return undefined;
}

export async function runBench(opts: RunBenchOptions): Promise<{ bench: BenchResult; dir: string }> {
  const { task, k } = opts;
  const concurrency = opts.concurrency ?? config.concurrency;

  // Where this bench lives, and what it already holds.
  let dir: string;
  let existing: RunResult[] = [];
  let startedAt = new Date().toISOString();
  let snapshotId: string;
  if (opts.resumeDir) {
    dir = path.resolve(opts.resumeDir);
    const prior = JSON.parse(fs.readFileSync(path.join(dir, "bench.json"), "utf8")) as BenchResult;
    if (prior.status === "complete") throw new Error(`${dir} is already complete; nothing to resume`);
    existing = readCompletedRuns(dir);
    startedAt = prior.startedAt;
    snapshotId = prior.snapshotId;
    console.log(`resuming ${task.id}: ${existing.length}/${prior.k} runs already on disk`);
  } else {
    snapshotId = opts.snapshotId ?? readSnapshots()[task.id] ?? (isFake() ? "snap_fake" : "");
    if (!snapshotId) throw new Error(`no snapshot for task "${task.id}" — run \`passk prepare\` first`);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    dir = path.join(config.runsDir, `${task.id}-${stamp}`);
    fs.mkdirSync(dir, { recursive: true });
  }

  const provenance = collectProvenance(task, concurrency, opts.budgetUsd ?? null);
  const done = new Map<number, RunResult>(existing.map((r) => [r.runIndex, r]));
  const bench: BenchResult = {
    status: "running", taskId: task.id, taskName: task.name, prompt: task.prompt, model: config.model,
    snapshotId, k, startedAt, finishedAt: startedAt, runs: existing, metrics: computeMetrics(existing, k), failures: [], provenance,
  };
  const persist = () => {
    bench.runs = [...done.values()].sort((a, b) => a.runIndex - b.runIndex);
    bench.metrics = computeMetrics(bench.runs, k);
    bench.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
  };
  persist(); // the manifest exists before anything is forked
  console.log(`bench ${task.id}: k=${k} concurrency=${concurrency} snapshot=${snapshotId}\n→ ${dir}`);

  // Budget cap: a shared tally the workers consult before forking. Runs already
  // in flight finish; nothing new starts once the cap is reached.
  let spentUsd = existing.reduce((s, r) => s + (r.usage.costUsd ?? 0), 0);
  const budgetLeft = () => opts.budgetUsd === undefined || spentUsd < opts.budgetUsd;
  let completedHere = 0;
  let aborted: Error | null = null;

  const pending = range(k).filter((i) => !done.has(i));
  await mapLimit(pending, concurrency, async (i) => {
    if (aborted) return;
    if (!budgetLeft()) { console.log(`[run ${i}] skipped: budget of $${opts.budgetUsd} reached ($${spentUsd.toFixed(2)} spent)`); return; }
    const r = await runOne(task, snapshotId, i, dir);
    spentUsd += r.usage.costUsd ?? 0;
    done.set(i, r);
    persist();
    completedHere++;
    if (opts.abortAfter !== undefined && completedHere >= opts.abortAfter && !aborted) aborted = new Error(`simulated crash after ${completedHere} runs`);
  });
  if (aborted) throw aborted;

  if (!isFake()) await sweep(task.id);
  bench.runs = [...done.values()].sort((a, b) => a.runIndex - b.runIndex);
  bench.metrics = computeMetrics(bench.runs, k);
  bench.failures = opts.noClassify ? [] : await classifyFailures(task, bench.runs, dir);
  bench.status = "complete";
  bench.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "bench.json"), JSON.stringify(bench, null, 2));
  fs.writeFileSync(path.join(dir, "report.html"), renderReport(bench));
  return { bench, dir };
}

/** Run indices currently holding a desktop in this process. Anything tagged with this task and not in here is a leak. */
const liveRuns = new Set<string>();

async function runOne(task: Task, snapshotId: string, runIndex: number, benchDir: string): Promise<RunResult> {
  const outDir = path.join(benchDir, runDirName(runIndex));
  fs.mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const tag = `[run ${runIndex}]`;
  let desktop: Desktop | undefined;

  try {
    desktop = await forkWithRetry(snapshotId, task, runIndex, tag);
    liveRuns.add(String(runIndex));
    console.log(`${tag} forked → ${desktop.id}`);

    const agent = await runAgent({
      desktop, prompt: task.prompt, outDir, maxSteps: task.max_steps ?? 40, checks: task.checks, runIndex,
      onStep: (s) => { if (!isFake()) console.log(`${tag} #${s.index} ${s.name}${s.error ? "  ✗ " + s.error : ""}`); },
    });

    const live = desktop;
    const finalPng = await withReconnect(live, () => live.screenshot({ format: "png" }));
    fs.writeFileSync(path.join(outDir, "final.png"), finalPng);
    const checks = await runChecks(desktop, task.checks, finalPng);
    // Outcome is judged by the checks alone. Whether the agent stopped on its
    // own, hit the cap, or crashed is recorded separately: it is a behavior
    // signal, not a verdict.
    const passed = checks.every((c) => c.passed);
    const verifierBroke = checks.some((c) => c.errored);
    // Priority: a verifier that could not run leaves the outcome unknown; a
    // provider outage is not the agent's doing; otherwise the checks decide,
    // and an agent-side crash after a correct result is still a pass.
    let status: RunResult["status"];
    let errorKind: RunResult["errorKind"];
    if (verifierBroke) { status = "errored"; errorKind = "verifier"; }
    else if (!passed && agent.stoppedBy === "error" && agent.errorKind === "provider") { status = "errored"; errorKind = "provider"; }
    else if (passed) { status = "passed"; }
    else { status = "failed"; if (agent.stoppedBy === "error") errorKind = "agent"; }
    console.log(`${tag} ${status.toUpperCase()}${errorKind ? ` (${errorKind})` : ""} in ${agent.steps.length} steps (${agent.stoppedBy})`);

    const result: RunResult = {
      runIndex, sessionId: desktop.id, status, startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(), durationMs: Date.now() - started, steps: agent.steps, checks,
      finalScreenshot: "final.png", finalMessage: agent.finalMessage, error: agent.error, stoppedBy: agent.stoppedBy, errorKind,
      usage: { ...agent.usage, costUsd: estimateCostUsd(config.model, agent.usage.inputTokens, agent.usage.outputTokens) },
    };
    fs.writeFileSync(path.join(outDir, "run.json"), JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const message = (err as Error).message;
    console.error(`${tag} ERRORED: ${message}`);
    const result: RunResult = {
      runIndex, sessionId: desktop?.id ?? "", status: "errored", startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(), durationMs: Date.now() - started, steps: [], checks: [],
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, error: message, stoppedBy: "error", errorKind: "solari",
    };
    // An infrastructure error is still a completed attempt at this index: record it
    // so a resume does not silently retry it and shift the sample.
    fs.writeFileSync(path.join(outDir, "run.json"), JSON.stringify(result, null, 2));
    return result;
  } finally {
    await destroyDesktop(desktop);
    liveRuns.delete(String(runIndex));
  }
}

async function killStale(taskId: string, tag: string): Promise<void> {
  if (isFake()) return;
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
      if (/concurrent/i.test(msg)) await killStale(task.id, tag);
      console.warn(`${tag} fork failed (${msg}); retry ${i}/${attempts - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
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
