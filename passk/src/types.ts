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
  | { type: "exec"; cmd: string; args?: string[]; stdout_contains?: string; exit_code?: number }
  /** Ask Claude to judge the final screenshot against a rubric. */
  | { type: "screenshot_judge"; rubric: string };

/** A setup step run before the snapshot is taken (so every fork starts here). */
export type SetupStep =
  | { exec: string; args?: string[] }
  | { open: string; args?: string[] }
  | { write: string; content: string }
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

export interface RunResult {
  runIndex: number;
  sessionId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: TraceStep[];
  checks: CheckResult[];
  finalScreenshot?: string;
  /** The agent's final text message. */
  finalMessage?: string;
  usage: { inputTokens: number; outputTokens: number };
  error?: string;
}

export type FailureCause =
  | "stochastic_execution"
  | "task_ambiguity"
  | "behavior_variability"
  | "unknown";

export interface FailureAnalysis {
  runIndex: number;
  /** Step index where this run's action sequence first diverges from the reference passing run. */
  divergenceStep: number | null;
  cause: FailureCause;
  explanation: string;
}

export interface BenchResult {
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
}

export interface BenchMetrics {
  /** Runs the agent actually attempted (infra errors excluded). */
  n: number;
  passed: number;
  /** Runs lost to infrastructure before the agent acted. Reported, not scored. */
  errored: number;
  /** Probability one run passes. */
  passAt1: number;
  /** Probability that ALL of k independent runs pass: the number a user actually feels. */
  passPowK: Record<number, number>;
  /** Probability at least one of k runs passes. */
  passAtK: Record<number, number>;
  meanSteps: number;
  /** Spread of step counts across runs: a wide range is behavior variability even when everything passes. */
  minSteps: number;
  maxSteps: number;
  meanDurationMs: number;
}
