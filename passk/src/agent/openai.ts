/**
 * OpenAI agent: GPT-5.x driving the desktop through the Responses API
 * `computer` tool. The model returns a `computer_call` carrying a batch of
 * actions; we execute them in order, take ONE screenshot at the end of the
 * batch, and send it back as `computer_call_output`.
 *
 * Every fork is a disposable VM, so pending safety checks are acknowledged
 * automatically and recorded in the trace instead of pausing for a human.
 */
import type OpenAI from "openai";
import type { Desktop } from "@solarisdk/sdk";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { sleep, withReconnect } from "../desktop.js";
import { dataUrl, openai } from "../llm.js";
import type { TraceStep } from "../types.js";
import { DEFAULT_SYSTEM, type AgentRunOptions, type AgentRunOutput } from "./index.js";

type Action = OpenAI.Responses.ComputerAction;
type ComputerCall = OpenAI.Responses.ResponseComputerToolCall;

/** OpenAI key names (e.g. "CTRL", "ENTER", "a") → X11 key names the guest understands. */
const KEYMAP: Record<string, string> = {
  ctrl: "ctrl", control: "ctrl", alt: "alt", shift: "shift", cmd: "super", super: "super", win: "super", meta: "super",
  enter: "Return", return: "Return", esc: "Escape", escape: "Escape", backspace: "BackSpace", tab: "Tab", space: "space",
  delete: "Delete", del: "Delete", home: "Home", end: "End", pageup: "Page_Up", pagedown: "Page_Down",
  arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right", up: "Up", down: "Down", left: "Left", right: "Right",
};
// Single letters are lowercased: "CTRL+A" must become ctrl+a. Passing the capital
// through makes xdotool add shift, and ctrl+shift+a in Chrome opens the tab search
// panel, which then swallows everything typed next. Found the hard way.
const key = (k: string) => KEYMAP[k.toLowerCase()] ?? (k.length === 1 ? k.toLowerCase() : k);

async function withModifiers(desktop: Desktop, keys: string[] | null | undefined, fn: () => Promise<void>) {
  const mods = (keys ?? []).map(key);
  if (mods.length) await desktop.keyboard.down(mods);
  try { await fn(); } finally { if (mods.length) await desktop.keyboard.up(mods); }
}

async function execAction(desktop: Desktop, a: Action): Promise<void> {
  switch (a.type) {
    case "click": {
      const button = a.button === "right" ? "right" : a.button === "wheel" ? "middle" : "left";
      await withModifiers(desktop, a.keys, () => desktop.mouse.click(a.x, a.y, { button }));
      return;
    }
    case "double_click":
      await withModifiers(desktop, a.keys, () => desktop.mouse.doubleClick(a.x, a.y));
      return;
    case "move":
      await desktop.mouse.move(a.x, a.y);
      return;
    case "drag": {
      const [from, ...rest] = a.path;
      const to = rest[rest.length - 1] ?? from;
      await withModifiers(desktop, a.keys, () => desktop.mouse.drag({ x: from.x, y: from.y }, { x: to.x, y: to.y }));
      return;
    }
    case "scroll": {
      // scroll_y > 0 means scroll down. xdotool buttons: 4 up, 5 down, 6 left, 7 right.
      await desktop.mouse.move(a.x, a.y);
      const clicks = (v: number) => Math.min(30, Math.max(1, Math.round(Math.abs(v) / 40)));
      if (a.scroll_y) await desktop.exec("xdotool", { args: ["click", "--repeat", String(clicks(a.scroll_y)), "--delay", "30", a.scroll_y > 0 ? "5" : "4"] });
      if (a.scroll_x) await desktop.exec("xdotool", { args: ["click", "--repeat", String(clicks(a.scroll_x)), "--delay", "30", a.scroll_x > 0 ? "7" : "6"] });
      return;
    }
    case "type":
      await desktop.keyboard.type(a.text);
      return;
    case "keypress":
      // Joined with "+" on purpose: the guest treats an array as a sequence, a "+" string as a chord.
      await desktop.keyboard.press(a.keys.map(key).join("+"));
      return;
    case "wait":
      await sleep(2000);
      return;
    case "screenshot":
      return; // the batch always ends with a screenshot anyway
  }
}

/** One last tool-free turn so a capped run still tells us what it thought it was doing. */
async function finalWords(client: OpenAI, previousResponseId: string | undefined, pending: OpenAI.Responses.ResponseInput): Promise<string> {
  try {
    const r = await client.responses.create({
      model: config.model,
      previous_response_id: previousResponseId,
      input: [...pending, { role: "user", content: "Stop. Do not take any more actions. In a few sentences: what did you do, what is the current state, and what was unclear about the task?" }],
      max_output_tokens: 600,
    });
    return r.output_text?.trim() ?? "";
  } catch { return ""; }
}

export async function runOpenAIAgent(opts: AgentRunOptions): Promise<AgentRunOutput> {
  const { desktop, outDir } = opts;
  fs.mkdirSync(outDir, { recursive: true });
  const steps: TraceStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const client = openai();

  let input: OpenAI.Responses.ResponseInput = [{ role: "user", content: opts.prompt }];
  let previousResponseId: string | undefined;

  for (;;) {
    if (steps.length >= opts.maxSteps) {
      const finalMessage = await finalWords(client, previousResponseId, input);
      return { steps, finalMessage, usage, stoppedBy: "max_steps" };
    }

    let response: OpenAI.Responses.Response;
    try {
      response = await client.responses.create({
        model: config.model,
        instructions: opts.systemPrompt ?? DEFAULT_SYSTEM,
        tools: [{ type: "computer" }],
        input,
        previous_response_id: previousResponseId,
        truncation: "auto",
      });
    } catch (err) {
      return { steps, finalMessage: "", usage, stoppedBy: "error", error: (err as Error).message };
    }
    previousResponseId = response.id;
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;

    const calls = response.output.filter((o): o is ComputerCall => o.type === "computer_call");
    const text = response.output_text?.trim() ?? "";
    if (calls.length === 0) return { steps, finalMessage: text, usage, stoppedBy: "end_turn" };

    input = [];
    for (const call of calls) {
      const actions: Action[] = call.actions?.length ? call.actions : call.action ? [call.action] : [];
      let failed: string | undefined;

      for (const a of actions) {
        const started = Date.now();
        const step: TraceStep = {
          index: steps.length, name: a.type, input: a, startedAt: new Date(started).toISOString(), durationMs: 0,
          text: steps.length === 0 || text ? text || undefined : undefined,
        };
        if (failed) step.error = "not executed: an earlier action in this batch failed";
        else {
          try { await withReconnect(desktop, () => execAction(desktop, a)); }
          catch (err) { failed = (err as Error).message; step.error = failed; }
        }
        step.durationMs = Date.now() - started;
        steps.push(step);
        opts.onStep?.(step);
      }

      // One screenshot per batch, attached to the last step so the trace stays visual.
      await sleep(500);
      const png = await withReconnect(desktop, () => desktop.screenshot({ format: "png" }));
      const file = `step-${String(Math.max(0, steps.length - 1)).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(outDir, file), png);
      if (steps.length) steps[steps.length - 1].screenshot = file;

      if (call.pending_safety_checks?.length) {
        steps[steps.length - 1].text = `[acknowledged safety checks: ${call.pending_safety_checks.map((c) => c.code ?? c.id).join(", ")}]`;
      }

      input.push({
        type: "computer_call_output",
        call_id: call.call_id,
        output: { type: "computer_screenshot", image_url: dataUrl(png) },
        acknowledged_safety_checks: call.pending_safety_checks?.map((c) => ({ id: c.id, code: c.code, message: c.message })),
      });
    }
  }
}
