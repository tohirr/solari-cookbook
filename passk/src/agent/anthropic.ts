/**
 * Claude agent: a plain computer-use loop over one Solari desktop.
 * Deliberately unremarkable — passk measures the loop, it doesn't try to be
 * a clever one.
 */
import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { anthropic as claude } from "../llm.js";
import type { TraceStep } from "../types.js";
import { runComputerAction } from "./computer.js";
import { DEFAULT_SYSTEM, type AgentRunOptions, type AgentRunOutput } from "./index.js";

const COMPUTER_TOOLSET: Anthropic.Beta.BetaToolUnion = {
  type: "computer_toolset_20260801",
  cache_control: { type: "ephemeral" },
} as Anthropic.Beta.BetaToolUnion;

/** One last tool-free turn so a capped run still tells us what it thought it was doing. */
async function finalWords(messages: Anthropic.Beta.BetaMessageParam[], system: string): Promise<string> {
  try {
    const r = await claude().beta.messages.create({
      model: config.model, max_tokens: 600, system,
      messages: [...messages, { role: "user", content: "Stop. Do not take any more actions. In a few sentences: what did you do, what is the current state, and what was unclear about the task?" }],
    });
    return r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch { return ""; }
}

export async function runAnthropicAgent(opts: AgentRunOptions): Promise<AgentRunOutput> {
  const { desktop, outDir } = opts;
  const keepImages = opts.keepImages ?? 6;
  fs.mkdirSync(outDir, { recursive: true });

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const steps: TraceStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let finalMessage = "";

  for (let turn = 0; ; turn++) {
    if (steps.length >= opts.maxSteps) {
      finalMessage = await finalWords(messages, opts.systemPrompt ?? DEFAULT_SYSTEM);
      return { steps, finalMessage, usage, stoppedBy: "max_steps" };
    }

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await claude().beta.messages.create({
        model: config.model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: config.effort },
        // Server-side refusal fallback: if the safety layer declines a turn, the
        // same request is re-run on Anthropic's default fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: opts.systemPrompt ?? DEFAULT_SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [COMPUTER_TOOLSET],
        messages,
      });
    } catch (err) {
      return { steps, finalMessage, usage, stoppedBy: "error", error: (err as Error).message };
    }

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      return { steps, finalMessage, usage, stoppedBy: "refusal" };
    }

    messages.push({ role: "assistant", content: response.content });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0) {
      finalMessage = text;
      return { steps, finalMessage, usage, stoppedBy: "end_turn" };
    }

    // Execute in order; once one action fails, the rest of the batch is skipped
    // so the model re-plans from a fresh screenshot instead of acting blind.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let batchFailed = false;
    for (const tu of toolUses) {
      const started = Date.now();
      const step: TraceStep = {
        index: steps.length,
        name: tu.name,
        input: tu.input,
        startedAt: new Date(started).toISOString(),
        durationMs: 0,
        text: results.length === 0 && text ? text : undefined,
      };

      if (batchFailed) {
        step.error = "not executed: an earlier action in this turn failed";
        results.push({ type: "tool_result", tool_use_id: tu.id, toolset_name: "computer", is_error: true,
          content: "Not executed: an earlier computer action in this turn failed." });
      } else {
        try {
          const out = await runComputerAction(desktop, tu.name, tu.input);
          if (out.screenshot) {
            const file = `step-${String(step.index).padStart(3, "0")}.png`;
            fs.writeFileSync(path.join(outDir, file), out.screenshot);
            step.screenshot = file;
          }
          if (out.isError) { step.error = String(out.content); batchFailed = true; }
          results.push({ type: "tool_result", tool_use_id: tu.id, toolset_name: "computer", content: out.content, is_error: out.isError });
        } catch (err) {
          step.error = (err as Error).message;
          batchFailed = true;
          results.push({ type: "tool_result", tool_use_id: tu.id, toolset_name: "computer", is_error: true,
            content: `Error: ${step.error}` });
        }
      }
      step.durationMs = Date.now() - started;
      steps.push(step);
      opts.onStep?.(step);
    }

    messages.push({ role: "user", content: results });
    pruneImages(messages, keepImages);
  }
}

/** Replace all but the newest N screenshots with a stub so context stays bounded. */
function pruneImages(messages: Anthropic.Beta.BetaMessageParam[], keep: number): void {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const block of m.content) {
      if (block.type !== "tool_result" || !Array.isArray(block.content)) continue;
      const hasImage = block.content.some((c) => c.type === "image");
      if (!hasImage) continue;
      seen++;
      if (seen > keep) block.content = [{ type: "text", text: "[older screenshot removed to save context]" }];
    }
  }
}
