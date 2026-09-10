/**
 * `passk compare <benchA> <benchB>` — the fifth step: change one thing, and
 * learn whether reliability moved.
 *
 * Two saved benches are put side by side. The tool insists on saying what was
 * held fixed (snapshot, checks, model) and what changed (prompt, environment),
 * because a comparison where several things changed at once explains nothing.
 * Differences on 5-vs-5 samples are rarely statistically significant, and the
 * output says so: it gives the observed delta, both intervals, and Fisher's
 * exact p-value, not a verdict.
 */
import fs from "node:fs";
import path from "node:path";
import { backfillCosts, computeMetrics, regrade } from "./metrics.js";
import { unlabelled } from "./provenance.js";
import type { BenchMetrics, BenchResult } from "./types.js";

export interface Comparison {
  a: Side;
  b: Side;
  heldFixed: string[];
  changed: string[];
  warnings: string[];
  /** The k used for the pass^k row: 5, or fewer when a side attempted fewer runs, so both sides are estimated at the same k. */
  powK: number;
  delta: {
    passAt1: number;
    passPowK: number;
    medianSteps: number;
    p95Steps: number;
    medianDurationMs: number;
    costPerSuccessUsd: number | null;
  };
  /** Two-sided Fisher exact test on passed/failed counts. */
  fisherP: number;
  /** Per check, when the checks were held fixed: what an intervention fixed and what it did not. Worst on side A first. */
  checks?: { label: string; invariant: boolean; a: { passed: number; n: number }; b: { passed: number; n: number }; delta: number }[];
}

interface Side {
  dir: string;
  taskId: string;
  taskName: string;
  prompt: string;
  model: string;
  snapshotId: string;
  taskHash: string | null;
  checks: string;
  systemPromptHash: string | null;
  safety: string | null;
  metrics: BenchMetrics;
}

export function loadBench(dir: string): BenchResult {
  const b = JSON.parse(fs.readFileSync(path.join(dir, "bench.json"), "utf8")) as BenchResult;
  b.status ??= "complete"; // benches written before the manifest existed
  regrade(b.runs);
  backfillCosts(b.runs, b.model);
  b.metrics = computeMetrics(b.runs, b.k);
  return b;
}

function side(dir: string, b: BenchResult): Side {
  const checks = JSON.stringify(b.provenance?.task?.checks ? unlabelled(b.provenance.task.checks) : null);
  return {
    dir, taskId: b.taskId, taskName: b.taskName, prompt: b.prompt.trim(), model: b.model, snapshotId: b.snapshotId,
    taskHash: b.provenance?.taskHash ?? null, checks, metrics: b.metrics,
    systemPromptHash: b.provenance?.systemPromptHash ?? null, safety: b.provenance?.safety ?? null,
  };
}

export function compareBenches(dirA: string, dirB: string): Comparison {
  dirA = path.resolve(dirA); dirB = path.resolve(dirB);
  const A = side(dirA, loadBench(dirA)), B = side(dirB, loadBench(dirB));
  const heldFixed: string[] = [], changed: string[] = [], warnings: string[] = [];
  const cmp = (label: string, x: unknown, y: unknown) => (x === y ? heldFixed : changed).push(label);
  cmp("snapshot", A.snapshotId, B.snapshotId);
  cmp("prompt", A.prompt, B.prompt);
  cmp("model", A.model, B.model);
  cmp("checks", A.checks, B.checks);
  // Recorded only since 0.1.1; older benches cannot be compared on these, and silence is not "held fixed".
  if (A.systemPromptHash && B.systemPromptHash) cmp("system prompt", A.systemPromptHash, B.systemPromptHash);
  if (A.safety && B.safety) cmp("safety", A.safety, B.safety);
  if (A.checks === "null" || B.checks === "null") warnings.push("one side predates provenance capture; its checks are not recorded, so 'checks held fixed' cannot be verified");
  if (changed.length === 0) warnings.push("nothing differs between these benches except the runs themselves; this measures run-to-run noise, which is still useful");
  if (changed.length > 1) warnings.push(`more than one thing changed (${changed.join(", ")}); the comparison cannot attribute the difference to a single cause`);
  if (A.metrics.n < 5 || B.metrics.n < 5) warnings.push("fewer than 5 attempted runs on a side; treat the delta as a hint, not a result");

  const m = A.metrics, n = B.metrics;
  const powK = Math.max(1, Math.min(5, m.n, n.n));
  return {
    a: A, b: B, heldFixed, changed, warnings, powK,
    delta: {
      passAt1: n.passAt1 - m.passAt1,
      passPowK: (n.passPowK[powK] ?? 0) - (m.passPowK[powK] ?? 0),
      medianSteps: n.medianSteps - m.medianSteps,
      p95Steps: n.p95Steps - m.p95Steps,
      medianDurationMs: n.medianDurationMs - m.medianDurationMs,
      costPerSuccessUsd: m.costPerSuccessUsd !== null && n.costPerSuccessUsd !== null ? n.costPerSuccessUsd - m.costPerSuccessUsd : null,
    },
    fisherP: fisherExact(m.passed, m.n - m.passed, n.passed, n.n - n.passed),
    ...(A.checks === B.checks && A.checks !== "null" && m.checks?.length > 1 && m.checks.length === n.checks?.length
      ? { checks: m.checks.map((ca, i) => {
          const cb = n.checks[i];
          const ra = ca.n ? ca.passed / ca.n : 1, rb = cb.n ? cb.passed / cb.n : 1;
          return { label: ca.label, invariant: ca.invariant, a: { passed: ca.passed, n: ca.n }, b: { passed: cb.passed, n: cb.n }, delta: rb - ra };
        }).sort((x, y) => (x.a.n ? x.a.passed / x.a.n : 1) - (y.a.n ? y.a.passed / y.a.n : 1)) }
      : {}),
  };
}

/** Two-sided Fisher exact test for a 2x2 table [[a, b], [c, d]]. Exact, fine for the small n passk deals in. */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  if (n === 0) return 1;
  const logFact = (x: number) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  const logHyper = (a: number, b: number, c: number, d: number) =>
    logFact(a + b) + logFact(c + d) + logFact(a + c) + logFact(b + d) - logFact(a) - logFact(b) - logFact(c) - logFact(d) - logFact(n);
  const observed = logHyper(a, b, c, d);
  const row1 = a + b, col1 = a + c;
  let p = 0;
  for (let x = Math.max(0, col1 - (c + d)); x <= Math.min(row1, col1); x++) {
    const lp = logHyper(x, row1 - x, col1 - x, n - row1 - col1 + x);
    if (lp <= observed + 1e-9) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

export function formatComparison(c: Comparison): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const sign = (x: number, unit = "") => `${x > 0 ? "+" : ""}${Number.isInteger(x) ? x : x.toFixed(2)}${unit}`;
  const row = (label: string, fa: string, fb: string, d = "") => `${label.padEnd(18)}${fa.padEnd(26)}${fb.padEnd(26)}${d}`;
  const m = c.a.metrics, n = c.b.metrics;
  const lines = [
    `A: ${c.a.taskName}  (${path.basename(c.a.dir)})`,
    `B: ${c.b.taskName}  (${path.basename(c.b.dir)})`,
    ``,
    `held fixed: ${c.heldFixed.join(", ") || "nothing"}`,
    `changed:    ${c.changed.join(", ") || "nothing"}`,
    ...c.warnings.map((w) => `warning:    ${w}`),
    ``,
    row("", "A", "B", "Δ (B − A)"),
    row("passed", `${m.passed}/${m.n}`, `${n.passed}/${n.n}`, sign(n.passed - m.passed)),
    row("pass@1", `${pct(m.passAt1)} (${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)})`, `${pct(n.passAt1)} (${pct(n.passAt1Lower)}–${pct(n.passAt1Upper)})`, sign(Math.round(c.delta.passAt1 * 100), " pts")),
    row(`pass^${c.powK} est.`, pct(m.passPowK[c.powK] ?? 0), pct(n.passPowK[c.powK] ?? 0), sign(Math.round(c.delta.passPowK * 100), " pts")),
    row("median steps", String(m.medianSteps), String(n.medianSteps), sign(c.delta.medianSteps)),
    row("p95 steps", String(m.p95Steps), String(n.p95Steps), sign(c.delta.p95Steps)),
    row("median time", `${(m.medianDurationMs / 1000).toFixed(0)}s`, `${(n.medianDurationMs / 1000).toFixed(0)}s`, sign(Math.round(c.delta.medianDurationMs / 1000), "s")),
    row("cost / success", m.costPerSuccessUsd === null ? "—" : `$${m.costPerSuccessUsd.toFixed(3)}`, n.costPerSuccessUsd === null ? "—" : `$${n.costPerSuccessUsd.toFixed(3)}`, c.delta.costPerSuccessUsd === null ? "" : sign(Number(c.delta.costPerSuccessUsd.toFixed(3)), "")),
    ...(c.checks ? [``, `by check, where either side missed (A · B · Δ):`, ...c.checks.filter((x) => x.a.passed < x.a.n || x.b.passed < x.b.n).map((x) => `  ${`${x.a.passed}/${x.a.n}`.padEnd(8)}${`${x.b.passed}/${x.b.n}`.padEnd(8)}${sign(Math.round(x.delta * 100), " pts").padEnd(10)}${x.label}${x.invariant ? "  (guard)" : ""}`)] : []),
    ``,
    `Fisher exact p = ${c.fisherP.toFixed(3)} for the pass/fail split${c.fisherP < 0.05 ? " (unlikely to be noise)" : " (consistent with noise at this sample size; the step and cost columns may still be informative)"}`,
  ];
  if (c.changed.includes("prompt")) lines.push(``, `prompt A: ${c.a.prompt}`, `prompt B: ${c.b.prompt}`);
  return lines.join("\n");
}
