/**
 * The agent contract, as types only.
 *
 *   import type { AgentRunOptions, AgentRunOutput } from "passk/agent-types";
 *
 * A custom agent (`PASSK_AGENT=path`, or the action's `agent:` input) is a
 * module in *your* repo, type-checked by *your* tsconfig. Before this entry
 * existed the only way to type it was to restate these declarations by hand,
 * which meant two copies of a contract that passk is free to extend.
 *
 * There is no runtime here: nothing to import at run time, nothing to install,
 * no dependency on the Solari SDK. `Desktop` below is the slice of the SDK's
 * desktop handle an agent actually drives, declared structurally, so a real
 * `Desktop` satisfies it without the SDK being present in your build. If you
 * do depend on the SDK, use its own `Desktop` type instead — it is assignable
 * to this one, and `src/agent/published-contract.ts` in passk keeps that true.
 */

/** One action the agent took, as recorded in the run's trace. */
export interface TraceStep {
  index: number;
  /** The tool call's name, e.g. "screenshot", "click", "type". */
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

/** How the agent loop ended. Independent of pass/fail: the checks decide that, inside the VM. */
export type StoppedBy = "end_turn" | "max_steps" | "refusal" | "error" | "safety_check";

/**
 * Who is responsible when the loop ends in error. "agent" is scored as a
 * failure; "provider" (the model API) and "solari" (the desktop) are not
 * scored against the agent at all, so reporting them honestly is worth more
 * than a tidy trace.
 */
export type ErrorKind = "agent" | "provider" | "solari" | "verifier";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * The desktop handle, as an agent uses it: a live VM, disposable, forked from
 * the task's snapshot. This is a structural subset of `Desktop` from
 * `@solarisdk/sdk` — every member here has the same signature there.
 */
export interface Desktop {
  /** The session id. */
  readonly id: string;
  /** Watch this run in a browser while it happens. */
  readonly streamUrl: string;
  screenshot(opts?: { format?: "png" | "jpeg"; quality?: number }): Promise<Uint8Array>;
  exec(cmd: string, opts?: { args?: string[]; cwd?: string; timeoutMs?: number }): Promise<ExecResult>;
  /** Launch a GUI app by name; returns its pid. */
  open(name: string, args?: string[]): Promise<number>;
  readonly mouse: {
    move: (x: number, y: number, opts?: { humanize?: boolean }) => Promise<void>;
    click: (x: number, y: number, opts?: { button?: "left" | "right" | "middle"; humanize?: boolean }) => Promise<void>;
    doubleClick: (x: number, y: number, opts?: { button?: "left" | "right" | "middle"; humanize?: boolean }) => Promise<void>;
    down: (x: number, y: number, button?: "left" | "right" | "middle") => Promise<void>;
    up: (x: number, y: number, button?: "left" | "right" | "middle") => Promise<void>;
    scroll: (x: number, y: number, opts?: { button?: "left" | "right" | "middle"; humanize?: boolean }) => Promise<void>;
    drag: (from: { x: number; y: number }, to: { x: number; y: number }, button?: "left" | "right" | "middle") => Promise<void>;
  };
  readonly keyboard: {
    type: (text: string) => Promise<void>;
    press: (keys: string | string[]) => Promise<void>;
    hotkey: (...keys: string[]) => Promise<void>;
    down: (keys: string | string[]) => Promise<void>;
    up: (keys: string | string[]) => Promise<void>;
  };
  readonly fs: {
    read: (path: string) => Promise<Uint8Array>;
    readText: (path: string) => Promise<string>;
    write: (path: string, data: Uint8Array | string, mode?: number) => Promise<void>;
    remove: (path: string, recursive?: boolean) => Promise<void>;
    mkdir: (path: string) => Promise<void>;
  };
  readonly display: {
    set: (w: number, h: number) => Promise<void>;
    size: () => Promise<{ w: number; h: number }>;
    cursor: () => Promise<{ x: number; y: number }>;
  };
  readonly clipboard: {
    get: () => Promise<string>;
    set: (text: string) => Promise<void>;
  };
}

/**
 * What passk hands your agent. The task's checks are deliberately absent:
 * an agent that can read the grading criteria is not being measured on the
 * task, and passk strips them before the call.
 */
export interface AgentRunOptions {
  /** A live fork of the task's snapshot, yours for this run and killed after it. */
  desktop: Desktop;
  /** The task's prompt, exactly as a user would type it. */
  prompt: string;
  /** Where to write step screenshots; the report links whatever you name in a step's `screenshot`. */
  outDir: string;
  /** The step budget. Going past it is the harness's business, not yours: stop and say so. */
  maxSteps: number;
  systemPrompt?: string;
  /** How many recent screenshots your loop should keep in context, if it keeps any. */
  keepImages?: number;
  /** Call it as each step completes and the run log shows progress live. */
  onStep?: (step: TraceStep) => void;
  /** Which run of the bench this is, 0-based. */
  runIndex?: number;
}

/**
 * What your agent returns. `finalMessage` is recorded and shown, never graded:
 * the verdict comes from the task's checks, evaluated inside the desktop after
 * you stop.
 */
export interface AgentRunOutput {
  steps: TraceStep[];
  finalMessage: string;
  usage: { inputTokens: number; outputTokens: number };
  stoppedBy: StoppedBy;
  error?: string;
  /** Who was at fault when `stoppedBy` is "error". Say "provider" for a model outage and the run is not scored against you. */
  errorKind?: ErrorKind;
}

/** The whole contract: a module exporting `runAgent`, or a default export, with this signature. */
export type PasskAgent = (opts: AgentRunOptions) => Promise<AgentRunOutput>;
