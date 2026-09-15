/**
 * The smallest custom agent: what PASSK_AGENT=path loads. It takes a few
 * screenshots, writes the file the fake task wants, and reports how it
 * stopped. It never sees the task's checks; it knows the file because this
 * fixture is written for tasks/fake.yaml. A real agent would drive the
 * desktop from the prompt with a model of its choosing.
 */
import type { AgentRunOptions, AgentRunOutput } from "../../src/agent/index.js";

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunOutput> {
  if ("checks" in opts) throw new Error("a custom agent must never receive the checks");
  const steps: AgentRunOutput["steps"] = [];
  for (let i = 0; i < 3; i++) {
    await opts.desktop.screenshot({ format: "png" });
    steps.push({ index: i, name: "screenshot", input: {}, startedAt: new Date().toISOString(), durationMs: 1 });
  }
  await opts.desktop.fs.write("/tmp/target.txt", "magic\n");
  steps.push({ index: 3, name: "write", input: { path: "/tmp/target.txt" }, startedAt: new Date().toISOString(), durationMs: 1 });
  return { steps, finalMessage: `Wrote the magic word (prompt: ${opts.prompt.slice(0, 20)}…)`, usage: { inputTokens: 0, outputTokens: 0 }, stoppedBy: "end_turn" };
}
