/**
 * Shared types for passk.
 *
 * A Task is what you ask the agent to do. A Run is one attempt on one forked
 * desktop. A Bench is k runs of the same task from the same snapshot.
 */

/** One assertion evaluated inside the desktop after the agent stops. */
export type Check =
  | { type: "file_exists"; path: string }
  | { type: "file_contains"; path: string; text: string }
  | { type: "file_equals"; path: string; text: string }
  /** Run a command. With `stdout_contains` and no `exit_code`, only the output is judged; otherwise exit 0 (or `exit_code`) is required. */
  | { type: "exec"; cmd: string; args?: string[]; stdout_contains?: string; exit_code?: number }
  /** Ask Claude to judge the final screenshot against a rubric. */
  | { type: "screenshot_judge"; rubric: string };

/** A setup step run before the snapshot is taken (so every fork starts here). */
export type SetupStep =
  | { exec: string; args?: string[] }
  | { open: string; args?: string[] }
  | { write: string; content: string }
  /** Copy a local file into the guest. Paths are relative to the working directory. */
  | { upload: string; to: string }
  /** Press a key or "+"-joined chord, e.g. "Return" or "ctrl+s". */
  | { press: string }
  /** Type literal text into whatever has focus. */
  | { type: string }
  | { click: [number, number] }
  | { wait: number };

export interface Task {
  id: string;
  name: string;
  /** Solari desktop template: "default" | "office" | "code" | custom template id */
  template?: string;
  resolution?: string;
  setup?: SetupStep[];
  /** The instruction handed to the agent. Deliberately whatever a user would type. */
  prompt: string;
  checks: Check[];
  /** Hard cap on agent steps (tool calls) per run. */
  max_steps?: number;
}

export interface TraceStep {
  index: number;
  name: string;
  input: unknown;
  startedAt: string;
  durationMs: number;
  /** Relative path of the screenshot captured for this step, if any. */
  screenshot?: string;
  error?: string;
  /** Model text emitted alongside this tool call, if any. */
  text?: string;
}

export interface CheckResult {
  check: Check;
  passed: boolean;
  detail?: string;
}

export type RunStatus = "passed" | "failed" | "errored";

/**
 * How the agent loop ended. Independent of pass/fail: a run can hit the step
 * cap with the task already done, or declare success with nothing saved.
 */
export type StoppedBy = "end_turn" | "max_steps" | "refusal" | "error";

export interface RunResult {
  runIndex: number;
  sessionId: string;
  /** passed = every check passed, judged inside the VM. Nothing the agent said counts. */
  status: RunStatus;
  stoppedBy?: StoppedBy;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: TraceStep[];
  checks: CheckResult[];
  finalScreenshot?: string;
  /** The agent's final text message. */
  finalMessage?: string;
  usage: { inputTokens: number; outputTokens: number; costUsd?: number };
  error?: string;
}

export type FailureCause =
  | "stochastic_execution"
  | "task_ambiguity"
  | "behavior_variability"
  | "unknown";

/**
 * A hypothesis about why a run failed, not a verdict. The first divergent
 * action is where the traces part ways, which is not necessarily the action
 * that caused the failure; and without a passing reference there is nothing
 * to diverge from, so confidence is "low" and the cause is left "unknown".
 */
export interface FailureAnalysis {
  runIndex: number;
  /** Step index where this run's action sequence first diverges from the reference run, if there was one. */
  divergenceStep: number | null;
  /** Whether the reference this run was compared against actually passed. */
  referencePassed: boolean;
  cause: FailureCause;
  confidence: "low" | "medium" | "high";
  explanation: string;
}

/** Everything needed to reproduce or audit a bench, captured at run time. */
export interface Provenance {
  passkVersion: string;
  gitCommit: string | null;
  provider: string;
  model: string;
  effort: string;
  concurrency: number;
  node: string;
  packages: Record<string, string>;
  /** sha256 of the canonical task JSON, so two benches can be compared only when the task was identical. */
  taskHash: string;
  /** The full task definition as run, so the checks that produced this result are never in doubt. */
  task: Task;
  budgetUsd: number | null;
}

export interface BenchResult {
  /** "running" while runs are still being added (or the process died); "complete" after finalize. */
  status: "running" | "complete";
  taskId: string;
  taskName: string;
  prompt: string;
  model: string;
  snapshotId: string;
  k: number;
  startedAt: string;
  finishedAt: string;
  runs: RunResult[];
  metrics: BenchMetrics;
  failures: FailureAnalysis[];
  provenance: Provenance;
}

export interface BenchMetrics {
  /** Runs the user asked for. */
  requested: number;
  /** Runs the agent actually attempted (infra errors excluded). */
  n: number;
  passed: number;
  /** Runs lost to infrastructure before the agent acted. Reported, not scored against the agent. */
  errored: number;
  /** Runs never started because the budget cap was reached. */
  skipped: number;
  /** Observed pass rate given a ready desktop: passed / n. A point estimate from a small sample. */
  passAt1: number;
  /** 95% Wilson interval on passAt1. 10/10 gives a lower bound near 72%, not 100%. */
  passAt1Lower: number;
  passAt1Upper: number;
  /** What the user actually got: passed / requested. Infrastructure losses count here. */
  endToEnd: number;
  /** Estimated probability that ALL of k independent runs pass: the number a user actually feels. */
  passPowK: Record<number, number>;
  /** Lower bound of passPowK, from the Wilson lower bound raised to the k. */
  passPowKLower: Record<number, number>;
  /** Estimated probability at least one of k runs passes. */
  passAtK: Record<number, number>;
  meanSteps: number;
  medianSteps: number;
  p95Steps: number;
  /** Spread of step counts across runs: a wide range is behavior variability even when everything passes. */
  minSteps: number;
  maxSteps: number;
  meanDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  /** Model spend across all runs, from recorded token usage and a price table. Undefined prices count as zero. */
  totalCostUsd: number;
  /** Mean model spend per passing run, the number that turns reliability into a budget line. */
  costPerSuccessUsd: number | null;
}
