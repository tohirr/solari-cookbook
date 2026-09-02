/**
 * The agent under test. One interface, two loops:
 *   anthropic.ts  Claude + computer_toolset_20260801 (Messages API)
 *   openai.ts     GPT-5.x + the `computer` tool (Responses API)
 * Add a file here to bench a third.
 */
import type { Desktop } from "@solarisdk/sdk";
import { config } from "../config.js";
import type { TraceStep } from "../types.js";

export interface AgentRunOptions {
  desktop: Desktop;
  prompt: string;
  /** Directory where step screenshots are written. */
  outDir: string;
  maxSteps: number;
  systemPrompt?: string;
  /** How many recent screenshots stay in context. Older ones are replaced with a stub. */
  keepImages?: number;
  onStep?: (step: TraceStep) => void;
}

export interface AgentRunOutput {
  steps: TraceStep[];
  finalMessage: string;
  usage: { inputTokens: number; outputTokens: number };
  stoppedBy: "end_turn" | "max_steps" | "refusal" | "error";
  error?: string;
}

export const DEFAULT_SYSTEM = `You are operating a Linux desktop through screenshots and mouse/keyboard actions.
Work step by step: take a screenshot, act, and verify the result with another screenshot before moving on.
When the task is complete, stop and reply with one short sentence describing the final state.
Never ask the user questions — make a reasonable choice and continue.`;

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunOutput> {
  if (config.provider === "openai") {
    const { runOpenAIAgent } = await import("./openai.js");
    return runOpenAIAgent(opts);
  }
  const { runAnthropicAgent } = await import("./anthropic.js");
  return runAnthropicAgent(opts);
}
