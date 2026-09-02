/**
 * Why did a run fail when its siblings passed?
 *
 * Following Pinetree's "On the Reliability of Computer Use Agents" (2026), we
 * sort each failure into one of three sources:
 *   - stochastic_execution   the plan was right, the world flinched (a click
 *                            landed before the window mapped, a race, a timeout)
 *   - task_ambiguity         the agent read the instruction differently than
 *                            the passing runs did (different goal, not a slip)
 *   - behavior_variability   same reading of the task, different strategy or
 *                            drift mid-way (extra detours, wrong tool, gave up)
 *
 * We find the first step where the failing trace diverges from a passing
 * reference, then hand both traces plus the screenshots at the fork to Claude.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { structured } from "./llm.js";
import type { FailureAnalysis, RunResult, Task, TraceStep } from "./types.js";

const Analysis = z.object({
  cause: z.enum(["stochastic_execution", "task_ambiguity", "behavior_variability", "unknown"]),
  confidence: z.enum(["low", "medium", "high"]).describe("How well the evidence supports this single cause over the others."),
  explanation: z.string().describe("Two or three sentences a developer can act on. Say what is uncertain."),
});

/** Coordinates this close are the same click as far as divergence is concerned. */
const JITTER_PX = 40;

interface Loose { coordinate?: [number, number]; x?: number; y?: number; text?: string; keys?: string[] }

/** Same action, allowing for click jitter. Text and key chords must match exactly. */
function sameStep(a: TraceStep, b: TraceStep): boolean {
  if (a.name !== b.name) return false;
  const ia = (a.input ?? {}) as Loose, ib = (b.input ?? {}) as Loose;
  const ta = ia.text ?? (ia.keys ?? []).join("+"), tb = ib.text ?? (ib.keys ?? []).join("+");
  if (ta.slice(0, 24) !== tb.slice(0, 24)) return false;
  const ca = ia.coordinate ?? (ia.x !== undefined ? [ia.x, ia.y ?? 0] : undefined);
  const cb = ib.coordinate ?? (ib.x !== undefined ? [ib.x, ib.y ?? 0] : undefined);
  if (!ca || !cb) return ca === cb;
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) <= JITTER_PX;
}

export function divergencePoint(a: TraceStep[], b: TraceStep[]): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (!sameStep(a[i], b[i])) return i;
  return a.length === b.length ? null : n;
}

export async function classifyFailures(task: Task, runs: RunResult[], benchDir: string): Promise<FailureAnalysis[]> {
  const passing = runs.filter((r) => r.status === "passed");
  const failing = runs.filter((r) => r.status !== "passed");
  if (!failing.length) return [];
  // Shortest passing run is the cleanest reference. With no passing run there is
  // nothing to diverge from: the shortest failure stands in for trace context
  // only, and every hypothesis is capped at low confidence.
  const referencePassed = passing.length > 0;
  const ref = (referencePassed ? passing : failing).slice().sort((x, y) => x.steps.length - y.steps.length)[0];

  const out: FailureAnalysis[] = [];
  for (const run of failing) {
    if (run.status === "errored" && !run.steps.length) {
      out.push({ runIndex: run.runIndex, divergenceStep: null, referencePassed, cause: "unknown", confidence: "high",
        explanation: `Infrastructure error before the agent acted (${run.error}). Not an agent failure; excluded from pass estimates.` });
      continue;
    }
    const d = referencePassed && run !== ref ? divergencePoint(ref.steps, run.steps) : null;
    try {
      const verdict = await judge(task, ref, run, d, benchDir, referencePassed);
      const confidence = referencePassed ? verdict.confidence : "low";
      out.push({ runIndex: run.runIndex, divergenceStep: d, referencePassed, cause: verdict.cause, confidence, explanation: verdict.explanation });
    } catch (err) {
      out.push({ runIndex: run.runIndex, divergenceStep: d, referencePassed, cause: "unknown", confidence: "low", explanation: `classifier errored: ${(err as Error).message}` });
    }
  }
  return out;
}

function traceText(run: RunResult): string {
  return run.steps.map((s) => `${s.index}. ${s.name} ${JSON.stringify(s.input)}${s.error ? `  !! ${s.error}` : ""}${s.text ? `\n   "${s.text.slice(0, 160)}"` : ""}`).join("\n");
}

function screenshotAt(run: RunResult, benchDir: string, around: number | null): Uint8Array | null {
  const dir = path.join(benchDir, `run-${String(run.runIndex).padStart(2, "0")}`);
  const candidates = run.steps.filter((s) => s.screenshot && (around === null || s.index <= around + 1)).reverse();
  const file = candidates[0]?.screenshot ?? run.finalScreenshot;
  if (!file) return null;
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

async function judge(task: Task, ref: RunResult, run: RunResult, d: number | null, benchDir: string, refPassed: boolean) {
  const prompt = `Task given to the agent:
"""${task.prompt}"""

${refPassed ? "A PASSING run (reference) did this:" : "No run passed. The reference below is the SHORTEST FAILING run, so judge the failing run against the task itself, not against the reference:"}
${traceText(ref)}

The FAILING run did this (stopped by: ${run.error ? "error " + run.error : run.finalMessage || "end"}):
${traceText(run)}

Checks: ${run.checks.map((c) => `${c.passed ? "✓" : "✗"} ${JSON.stringify(c.check)} ${c.detail ?? ""}`).join("; ")}
First divergence from the reference: ${!refPassed ? "not applicable (no passing run to diverge from)" : d === null ? "none (same actions, different outcome)" : `step ${d}`}.
Checks are evaluated inside the VM after the agent stops; the agent's own claim of success carries no weight.
This is a hypothesis, not a verdict: the first differing action is where traces part ways, which need not be the action that caused the failure. If the evidence does not single out one cause, answer "unknown" with low confidence rather than guessing.

Classify the failure into exactly one cause:
- stochastic_execution: the agent's plan matched the reference but the environment or timing produced a different outcome (mis-registered click, window not ready, race). Also use this when the traces are identical yet the result differs.
- task_ambiguity: the agent pursued a different interpretation of the instruction than the reference (different target file, different meaning of a word, different notion of "done").
- behavior_variability: same interpretation, but a different or worse strategy: detours, wrong app, skipped verification, gave up early, hallucinated completion.
The images above are the screenshots near the divergence: the reference run first, then the failing run.`;
  const images = [screenshotAt(ref, benchDir, d), screenshotAt(run, benchDir, d)].filter((x): x is Uint8Array => !!x);

  const verdict = await structured({ name: "failure_analysis", schema: Analysis, prompt, images, maxTokens: 3000 });
  return verdict ?? { cause: "unknown" as const, confidence: "low" as const, explanation: "classifier returned no output" };
}
