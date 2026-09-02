/**
 * Executes `computer_toolset_20260801` member calls against a Solari desktop.
 *
 * Claude emits one tool_use per action (`name` is the member: "left_click",
 * "type", "screenshot", ...). We map each onto the Solari GUI RPCs and return
 * the tool_result content Claude expects: an image block for screenshot/zoom,
 * a short text otherwise.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Desktop } from "@solarisdk/sdk";
import { sleep } from "../desktop.js";

export type ToolResultContent = Anthropic.Beta.BetaToolResultBlockParam["content"];

export interface ActionOutcome {
  content: ToolResultContent;
  isError?: boolean;
  /** PNG bytes when the action produced a screenshot (for the trace). */
  screenshot?: Uint8Array;
}

type Coord = [number, number];

interface ActionInput {
  coordinate?: Coord;
  start_coordinate?: Coord;
  text?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  duration?: number;
  repeat?: number;
  region?: [number, number, number, number];
}

/**
 * Claude names keys xdotool-style ("Return", "ctrl+s", "alt+Tab"), which is
 * what the Solari guest speaks too — with one trap, verified on a live VM:
 * `keyboard.press(["ctrl", "s"])` presses the keys one after another (you get
 * a literal "s"), while `keyboard.press("ctrl+s")` sends the chord. So chords
 * are always joined with "+" into a single string here. `keyboard.down/up`
 * do hold modifiers correctly, which is what click-with-modifier needs.
 */
const MODS: Record<string, string> = {
  control: "ctrl", ctrl: "ctrl", cmd: "super", command: "super", super: "super",
  win: "super", alt: "alt", option: "alt", shift: "shift", meta: "super",
};
function parseKeyChord(text: string): string[] {
  return text.split("+").map((k) => MODS[k.trim().toLowerCase()] ?? k.trim());
}
const chord = (keys: string[]) => keys.join("+");

const imageBlock = (png: Uint8Array): ToolResultContent => [
  { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } },
];

async function screenshot(desktop: Desktop): Promise<ActionOutcome> {
  const png = await desktop.screenshot({ format: "png" });
  return { content: imageBlock(png), screenshot: png };
}

/**
 * Scroll. The SDK's `mouse.scroll` has no direction knob (X11 scroll is
 * buttons 4–7, which the typed MouseButton can't express), so we go through
 * xdotool in the guest and fall back to Page keys if it's missing.
 */
async function scroll(desktop: Desktop, input: ActionInput): Promise<void> {
  const [x, y] = input.coordinate ?? [640, 360];
  const amount = Math.max(1, Math.min(input.scroll_amount ?? 3, 30));
  const button = { up: "4", down: "5", left: "6", right: "7" }[input.scroll_direction ?? "down"];
  await desktop.mouse.move(x, y);
  const r = await desktop.exec("xdotool", { args: ["click", "--repeat", String(amount), "--delay", "30", button] });
  if (r.exitCode !== 0) {
    const key = input.scroll_direction === "up" ? "Page_Up" : "Page_Down";
    for (let i = 0; i < Math.ceil(amount / 3); i++) await desktop.keyboard.press(key);
  }
}

export async function runComputerAction(desktop: Desktop, name: string, rawInput: unknown): Promise<ActionOutcome> {
  const input = (rawInput ?? {}) as ActionInput;
  const ok = (text = "OK"): ActionOutcome => ({ content: [{ type: "text", text }] });
  const need = (c: Coord | undefined, what: string): Coord => {
    if (!c) throw new Error(`${name} requires ${what}`);
    return c;
  };
  const clickWithModifier = async (fn: () => Promise<void>) => {
    const mods = input.text ? parseKeyChord(input.text) : [];
    if (mods.length) await desktop.keyboard.down(mods);
    try { await fn(); } finally { if (mods.length) await desktop.keyboard.up(mods); }
  };

  switch (name) {
    case "screenshot":
      return screenshot(desktop);

    case "zoom": {
      // The guest has no crop RPC; return the full frame so the agent can still
      // proceed. Coordinates stay in screenshot space either way.
      return screenshot(desktop);
    }

    case "left_click": case "right_click": case "middle_click": {
      const [x, y] = need(input.coordinate, "coordinate");
      const button = name === "left_click" ? "left" : name === "right_click" ? "right" : "middle";
      await clickWithModifier(() => desktop.mouse.click(x, y, { button }));
      return ok();
    }
    case "double_click": {
      const [x, y] = need(input.coordinate, "coordinate");
      await clickWithModifier(() => desktop.mouse.doubleClick(x, y));
      return ok();
    }
    case "triple_click": {
      const [x, y] = need(input.coordinate, "coordinate");
      await clickWithModifier(async () => {
        await desktop.mouse.doubleClick(x, y);
        await desktop.mouse.click(x, y);
      });
      return ok();
    }
    case "left_click_drag": {
      const from = need(input.start_coordinate, "start_coordinate");
      const to = need(input.coordinate, "coordinate");
      await clickWithModifier(() => desktop.mouse.drag({ x: from[0], y: from[1] }, { x: to[0], y: to[1] }));
      return ok();
    }
    case "mouse_move": {
      const [x, y] = need(input.coordinate, "coordinate");
      await desktop.mouse.move(x, y);
      return ok();
    }
    case "left_mouse_down": {
      const c = await desktop.display.cursor();
      await desktop.mouse.down(c.x, c.y);
      return ok();
    }
    case "left_mouse_up": {
      const c = await desktop.display.cursor();
      await desktop.mouse.up(c.x, c.y);
      return ok();
    }
    case "cursor_position": {
      const c = await desktop.display.cursor();
      return ok(`X=${c.x}, Y=${c.y}`);
    }
    case "scroll":
      await scroll(desktop, input);
      return ok();

    case "type": {
      if (typeof input.text !== "string") throw new Error("type requires text");
      await desktop.keyboard.type(input.text);
      return ok();
    }
    case "key": {
      if (typeof input.text !== "string") throw new Error("key requires text");
      const keys = chord(parseKeyChord(input.text));
      const times = Math.max(1, Math.min(input.repeat ?? 1, 100));
      for (let i = 0; i < times; i++) await desktop.keyboard.press(keys);
      return ok();
    }
    case "hold_key": {
      if (typeof input.text !== "string") throw new Error("hold_key requires text");
      const keys = parseKeyChord(input.text);
      await desktop.keyboard.down(keys);
      await sleep(Math.min(input.duration ?? 1, 300) * 1000);
      await desktop.keyboard.up(keys);
      return ok();
    }
    case "wait": {
      await sleep(Math.min(input.duration ?? 1, 300) * 1000);
      return screenshot(desktop);
    }
    default:
      return { content: `Error: ${name} is not available in this environment`, isError: true };
  }
}
