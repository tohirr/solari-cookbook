/**
 * Your own agent, loaded from a path: PASSK_AGENT=src/my-agent.ts (or the
 * action's `agent:` input). The module exports `runAgent`, or a default
 * export, with this signature:
 *
 *   (opts: AgentRunOptions) => Promise<AgentRunOutput>
 *
 * It receives a live desktop handle, the prompt, a step budget and an output
 * directory, and returns the trace of actions it took, its token usage, and
 * how it stopped. Two rules make the bench honest and are not negotiable:
 * the agent never sees the task's checks (they are stripped here before the
 * call), and its own claim of success is recorded but never graded.
 * `src/agent/scripted.ts` is the smallest example of the shape; the module
 * resolves against the working directory, so its imports come from your
 * repo's node_modules.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentRunOptions, AgentRunOutput } from "./index.js";

export type CustomAgent = (opts: AgentRunOptions) => Promise<AgentRunOutput>;

let loaded: { file: string; fn: CustomAgent } | undefined;

export async function loadCustomAgent(spec = process.env.PASSK_AGENT ?? ""): Promise<CustomAgent> {
  const file = path.resolve(spec);
  if (loaded?.file === file) return loaded.fn;
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`PASSK_AGENT=${spec}: could not load ${file}: ${(err as Error).message}`);
  }
  const fn = (typeof mod.runAgent === "function" ? mod.runAgent : typeof mod.default === "function" ? mod.default : null) as CustomAgent | null;
  if (!fn) throw new Error(`PASSK_AGENT=${spec}: ${file} must export runAgent(opts) or a default function; exports: ${Object.keys(mod).join(", ") || "none"}`);
  loaded = { file, fn };
  return fn;
}

export async function runCustomAgent(opts: AgentRunOptions): Promise<AgentRunOutput> {
  const fn = await loadCustomAgent();
  const { checks: _hidden, ...visible } = opts;
  const out = await fn(visible);
  if (!out || !Array.isArray(out.steps) || !out.usage || !out.stoppedBy) {
    throw new Error(`PASSK_AGENT: the agent returned ${JSON.stringify(out)?.slice(0, 120)}; expected { steps, finalMessage, usage: { inputTokens, outputTokens }, stoppedBy }`);
  }
  return out;
}
