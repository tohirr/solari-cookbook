/**
 * A scripted agent: no model, no desktop input. Each run's behavior comes
 * from PASSK_SCRIPT, a comma list with optional repeats, indexed by run:
 *
 *   PASSK_SCRIPT="pass*15,fail*3,hang,claim_only"
 *
 *   pass         writes what the first file check wants, reports success
 *   fail         writes the wrong content, reports success (a false claim)
 *   claim_only   writes nothing, reports success
 *   hang         takes screenshots until the step cap
 *   provider_err throws the way a model API outage would
 *   crash_after  writes the right content, then throws (task done, agent died)
 *   slow         passes in 30 steps instead of 8
 *
 * Behavior repeats cyclically if the script is shorter than k. It records
 * every run index it was asked to execute, so a resume test can prove that
 * no index ran twice.
 */
import type { FakeDesktop } from "../fake/desktop.js";
import type { AgentRunOptions, AgentRunOutput } from "./index.js";
import type { Check, TraceStep } from "../types.js";

export type Behavior = "pass" | "fail" | "claim_only" | "hang" | "provider_err" | "crash_after" | "slow";

export function parseScript(spec: string | undefined): Behavior[] {
  const out: Behavior[] = [];
  for (const part of (spec ?? "pass").split(",")) {
    const [name, times] = part.trim().split("*");
    for (let i = 0; i < Number(times ?? 1); i++) out.push(name as Behavior);
  }
  return out.length ? out : ["pass"];
}

/** Every (runIndex) the scripted agent has executed in this process. */
export const executed: number[] = [];

function target(checks: Check[] | undefined): { path: string; text: string } | null {
  for (const c of checks ?? []) {
    if (c.type === "file_contains" || c.type === "file_equals") return { path: c.path, text: c.text };
    if (c.type === "file_exists") return { path: c.path, text: "ok" };
  }
  return null;
}

export async function runScriptedAgent(opts: AgentRunOptions & { runIndex?: number }): Promise<AgentRunOutput> {
  const idx = opts.runIndex ?? 0;
  executed.push(idx);
  const script = parseScript(process.env.PASSK_SCRIPT);
  const behavior = script[idx % script.length];
  const fake = opts.desktop as unknown as FakeDesktop;
  const want = target(opts.checks);
  const steps: TraceStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const step = (name: string, input: unknown = {}) => {
    steps.push({ index: steps.length, name, input, startedAt: new Date().toISOString(), durationMs: 1 });
    usage.inputTokens += 1000; usage.outputTokens += 20;
  };
  const act = async (n: number) => { for (let i = 0; i < n; i++) { step(i % 2 ? "left_click" : "screenshot", i % 2 ? { coordinate: [100 + i, 100] } : {}); await fake.screenshot(); } };

  switch (behavior) {
    case "pass": case "slow":
      await act(behavior === "slow" ? 30 : 8);
      if (want) await fake.fs.write(want.path, want.text + "\n");
      return { steps, finalMessage: "Done.", usage, stoppedBy: "end_turn" };
    case "fail":
      await act(10);
      if (want) await fake.fs.write(want.path, "something else\n");
      return { steps, finalMessage: "Done.", usage, stoppedBy: "end_turn" };
    case "claim_only":
      await act(6);
      return { steps, finalMessage: "Saved successfully.", usage, stoppedBy: "end_turn" };
    case "hang":
      await act(opts.maxSteps);
      return { steps, finalMessage: "", usage, stoppedBy: "max_steps" };
    case "provider_err":
      await act(3);
      return { steps, finalMessage: "", usage, stoppedBy: "error", error: "429 rate limit exceeded (simulated provider outage)" };
    case "crash_after":
      await act(8);
      if (want) await fake.fs.write(want.path, want.text + "\n");
      return { steps, finalMessage: "", usage, stoppedBy: "error", error: "socket hang up (simulated agent crash after completing)" };
  }
}
