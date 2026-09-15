/**
 * Shared types for passk.
 *
 * A Task is what you ask the agent to do. A Run is one attempt on one forked
 * desktop. A Bench is k runs of the same task from the same snapshot.
 */

/**
 * One assertion evaluated inside the desktop after the agent stops.
 * `invariant: true` marks a guard that must hold before AND after the agent
 * acts (the data survived) rather than a goal that must become true. Both
 * grade the run; `passk validate` treats them differently.
 * `name` is a human label for reports ("Invoice was created"); it never
 * affects grading or the task hash.
 */
export type Check = ({ invariant?: boolean; name?: string }) & (
  | { type: "file_exists"; path: string }
  | { type: "file_contains"; path: string; text: string }
  | { type: "file_equals"; path: string; text: string }
  /** Run a command. With `stdout_contains` and no `exit_code`, only the output is judged; otherwise exit 0 (or `exit_code`) is required. */
  | { type: "exec"; cmd: string; args?: string[]; stdout_contains?: string; exit_code?: number }
  /** Ask the model to judge the final screenshot against a rubric. */
  | { type: "screenshot_judge"; rubric: string });

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
  /**
   * Steps that produce the correct end state WITHOUT an agent, e.g. a curl to
   * the local app or writing the expected file. `passk validate` runs them on
   * a fork to prove the checks can pass, after proving they fail on the
   * untouched snapshot. A task whose checks pass before anyone acts, or
   * cannot pass at all, is a broken test, not a hard one.
   */
  golden?: SetupStep[];
  /**
   * Guest paths copied out of every fork after grading, into
   * `<run dir>/evidence/`. A check answers yes or no; the evidence file is the
   * diagnosis — the whole decisions map rather than "the hateful target is
   * still present". Without it that state dies with the VM.
   */
  evidence?: string[];
  /**
   * `private` keeps every screenshot inside `runs/`: `export` copies none of
   * them and the exported report shows none. For a task whose screens carry
   * real content — a library of someone's saved posts, a record with a real
   * name on it — the frames are the one artefact that cannot be published,
   * while the checks and the task-declared evidence files still can. Like
   * `evidence`, it cannot change an outcome, so it is not in the task hash.
   */
  screenshots?: "private";
  /**
   * A guest file of `{ identifier: label }`. Every run keeps a copy beside
   * its trace, never exported, and `export` rewrites the bench and its
   * evidence files so each identifier appears only as its label — "target 6
   * (hateful)" rather than the post's id. For evidence that must name real
   * things to grade honestly and must not name them in public. Not in the
   * task hash: it cannot change an outcome.
   */
  labels?: string;
}

/** One file copied out of a fork after grading. `file` and `bytes` are absent when the copy failed. */
export interface EvidenceFile {
  /** The guest path the task asked for. */
  path: string;
  /** Where it landed, relative to the run directory. */
  file?: string;
  bytes?: number;
  /** Why nothing was copied: missing, unreadable, or over the size cap. */
  error?: string;
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
  /** The check itself could not run (command missing, VM unreachable). Not a verdict on the agent. */
  errored?: boolean;
}

export type RunStatus = "passed" | "failed" | "errored";

/**
 * How the agent loop ended. Independent of pass/fail: a run can hit the step
 * cap with the task already done, or declare success with nothing saved.
 */
export type StoppedBy = "end_turn" | "max_steps" | "refusal" | "error" | "safety_check";

/**
 * Who is responsible for a run that did not complete normally.
 *   agent     the agent's own doing (malformed action, gave up, crashed on its own logic): scored as a failure
 *   provider  the model API (429, 5xx, connection reset after retries): not the agent's reliability, not scored
 *   solari    the desktop infrastructure (fork never ready, channel lost, concurrency): not scored
 *   verifier  the checker itself crashed: the run's outcome is unknown, not scored
 */
export type ErrorKind = "agent" | "provider" | "solari" | "verifier";

export interface RunResult {
  runIndex: number;
  sessionId: string;
  /** passed = every check passed, judged inside the VM. Nothing the agent said counts. */
  status: RunStatus;
  stoppedBy?: StoppedBy;
  /** Set when status is "errored" (or the agent loop ended in error): who was at fault. */
  errorKind?: ErrorKind;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: TraceStep[];
  checks: CheckResult[];
  finalScreenshot?: string;
  /** The agent's final text message. */
  finalMessage?: string;
  usage: { inputTokens: number; outputTokens: number; costUsd?: number };
  /** The task's `evidence` paths as copied out of this fork. Absent on benches run before the field existed. */
  evidence?: EvidenceFile[];
  /** The task's `labels` file as copied out of this fork, kept beside the trace and never exported. */
  labels?: EvidenceFile;
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
  /** Uncommitted changes in the working tree at run time: two benches can share a commit and run different code. Absent on benches before 0.1.1. */
  gitDirty?: boolean | null;
  /** sha256 prefix of the system prompt the agent loop was given. Absent on benches before 0.1.1. */
  systemPromptHash?: string;
  /** What the loop did when the model raised a safety check. Absent on benches before 0.1.1. */
  safety?: "allow" | "deny";
  /** Which agent loop ran: the provider's file in src/agent/. Absent on benches before 0.1.1. */
  agent?: string;
}

/**
 * What `passk run` proved about the verifier before forking the bench: the
 * checks failed on the untouched snapshot, agreed with themselves twice, and
 * passed after the task's golden steps. Recorded so a report can say the
 * numbers were produced by a verifier that was shown to be sound, not assumed.
 */
export interface ValidationSummary {
  at: string;
  ok: boolean;
  notes: string[];
  problems: string[];
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
  /** Absent on benches run with --no-validate, on resumed benches, and on benches that predate the fold. */
  validation?: ValidationSummary;
  /** False when classification was switched off for the run, so an empty `failures` is not mistaken for "nothing to explain". */
  classified?: boolean;
  /** Set by export when a labels map was applied: how many identifier occurrences became labels. */
  redacted?: number;
}

/** One check across the scored runs of a bench: how often it passed. */
export interface CheckStat {
  label: string;
  invariant: boolean;
  passed: number;
  /** Runs where this check ran without erroring. */
  n: number;
}

export interface BenchMetrics {
  /** Runs the user asked for. */
  requested: number;
  /** Runs the agent actually attempted (infra errors excluded). */
  n: number;
  passed: number;
  /** Runs not scored against the agent, by cause. `errored` is their total. */
  errored: number;
  lost: { solari: number; provider: number; verifier: number };
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
  /**
   * Model spend across all scored attempts divided by the number of passes:
   * what one success actually costs when the failures along the way are paid
   * for too. The number that turns reliability into a budget line.
   */
  costPerSuccessUsd: number | null;
  /** Mean spend of the passing runs alone: how much a run costs when it goes well. Always <= costPerSuccessUsd. */
  costPerPassingRunUsd: number | null;
  /** Pass count per check, in task order. Turns a pass rate into which rule fails. */
  checks: CheckStat[];
  /**
   * Runs that stopped of their own accord far below the bench's typical
   * effort and did not pass. A distinct failure shape from one that worked to
   * the step cap, and worth marking the way a lost run is; whether the agent
   * gave up or believed it was done is the classifier's question, not this
   * field's.
   */
  earlyQuits: number[];
  /** Step count at or below which a self-stopped failure counts as an early quit. 0 when the sample is too small or too short to support the test. */
  earlyQuitSteps: number;
}
