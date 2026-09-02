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
  explanation: z.string().describe("Two or three sentences a developer can act on."),
});

/** Coarse signature of an action so tiny coordinate jitter doesn't count as divergence. */
function sig(step: TraceStep): string {
  const i = step.input as { coordinate?: [number, number]; text?: string } | undefined;
  const coord = i?.coordinate ? `@${Math.round(i.coordinate[0] / 40)},${Math.round(i.coordinate[1] / 40)}` : "";
  const text = typeof i?.text === "string" ? `:${i.text.slice(0, 24)}` : "";
  return `${step.name}${coord}${text}`;
}

export function divergencePoint(a: TraceStep[], b: TraceStep[]): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (sig(a[i]) !== sig(b[i])) return i;
  return a.length === b.length ? null : n;
}

export async function classifyFailures(task: Task, runs: RunResult[], benchDir: string): Promise<FailureAnalysis[]> {
  const passing = runs.filter((r) => r.status === "passed");
  const failing = runs.filter((r) => r.status !== "passed");
  if (!failing.length) return [];
  // Shortest passing run is the cleanest reference; if nothing passed, compare against the median failure.
  const ref = (passing.length ? passing : failing).slice().sort((x, y) => x.steps.length - y.steps.length)[0];

  const out: FailureAnalysis[] = [];
  for (const run of failing) {
    if (run.status === "errored" && !run.steps.length) {
      out.push({ runIndex: run.runIndex, divergenceStep: null, cause: "stochastic_execution", explanation: `Infrastructure error before the agent acted: ${run.error}` });
      continue;
    }
    const d = run === ref ? null : divergencePoint(ref.steps, run.steps);
    try {
      const verdict = await judge(task, ref, run, d, benchDir);
      out.push({ runIndex: run.runIndex, divergenceStep: d, cause: verdict.cause, explanation: verdict.explanation });
    } catch (err) {
      out.push({ runIndex: run.runIndex, divergenceStep: d, cause: "unknown", explanation: `classifier errored: ${(err as Error).message}` });
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

async function judge(task: Task, ref: RunResult, run: RunResult, d: number | null, benchDir: string) {
  const refPassed = ref.status === "passed";
  const prompt = `Task given to the agent:
"""${task.prompt}"""

${refPassed ? "A PASSING run (reference) did this:" : "No run passed. The reference below is the SHORTEST FAILING run, so judge the failing run against the task itself, not against the reference:"}
${traceText(ref)}

The FAILING run did this (stopped by: ${run.error ? "error " + run.error : run.finalMessage || "end"}):
${traceText(run)}

Checks: ${run.checks.map((c) => `${c.passed ? "✓" : "✗"} ${JSON.stringify(c.check)} ${c.detail ?? ""}`).join("; ")}
First divergence from the reference: ${d === null ? (run === ref ? "this IS the reference run" : "none (same actions, different outcome)") : `step ${d}`}.
Checks are evaluated inside the VM after the agent stops; the agent's own claim of success carries no weight.

Classify the failure into exactly one cause:
- stochastic_execution: the agent's plan matched the reference but the environment or timing produced a different outcome (mis-registered click, window not ready, race). Also use this when the traces are identical yet the result differs.
- task_ambiguity: the agent pursued a different interpretation of the instruction than the reference (different target file, different meaning of a word, different notion of "done").
- behavior_variability: same interpretation, but a different or worse strategy: detours, wrong app, skipped verification, gave up early, hallucinated completion.
The images above are the screenshots near the divergence: the reference run first, then the failing run.`;
  const images = [screenshotAt(ref, benchDir, d), screenshotAt(run, benchDir, d)].filter((x): x is Uint8Array => !!x);

  const verdict = await structured({ name: "failure_analysis", schema: Analysis, prompt, images, maxTokens: 3000 });
  return verdict ?? { cause: "unknown" as const, explanation: "classifier returned no output" };
}
