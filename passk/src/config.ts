import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { Task } from "./types.js";

function loadDotenv(): void {
  const p = path.resolve(".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotenv();

const isSet = (name: string) => !!process.env[name] && !process.env[name]!.includes("...");

function need(name: string): string {
  if (!isSet(name)) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return process.env[name]!;
}

function detectProvider(): "anthropic" | "openai" | "scripted" {
  const explicit = process.env.PASSK_PROVIDER;
  if (explicit === "anthropic" || explicit === "openai" || explicit === "scripted") return explicit;
  if (isSet("ANTHROPIC_API_KEY")) return "anthropic";
  if (isSet("OPENAI_API_KEY")) return "openai";
  throw new Error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env (or PASSK_PROVIDER to pick one).");
}

const DEFAULT_MODEL = { anthropic: "claude-opus-5", openai: "gpt-5.6", scripted: "scripted" } as const;

export const config = {
  version: "0.1.1",
  get solariApiKey() { return need("SOLARI_API_KEY"); },
  get anthropicApiKey() { return need("ANTHROPIC_API_KEY"); },
  get openaiApiKey() { return need("OPENAI_API_KEY"); },
  get provider() { return detectProvider(); },
  /** No Solari, no model: in-memory desktops and the scripted agent. For testing the harness itself. */
  get fake() { return process.env.PASSK_FAKE === "1" || detectProvider() === "scripted"; },
  get model() { const p = detectProvider(); return p === "scripted" ? "scripted" : process.env.PASSK_MODEL ?? DEFAULT_MODEL[p]; },
  effort: (process.env.PASSK_EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max",
  /**
   * What to do when the model raises a safety check on an action (OpenAI's
   * computer tool does this for consequential-looking steps). "deny" stops the
   * run; "allow" acknowledges automatically. Allow is only defensible inside a
   * disposable VM with no route to real systems, which is what a bench is, so
   * set PASSK_SAFETY=allow in .env for benches and never anywhere else.
   */
  get safety() { return (process.env.PASSK_SAFETY === "allow" ? "allow" : "deny") as "allow" | "deny"; },
  concurrency: Number(process.env.PASSK_CONCURRENCY ?? 2),
  /** Rolling idle window for a desktop. Resets on every action. */
  desktopTimeoutMs: 15 * 60_000,
  get runsDir() { return path.resolve(process.env.PASSK_RUNS_DIR ?? "runs"); },
  get stateDir() { return path.resolve(process.env.PASSK_STATE_DIR ?? ".passk"); },
};

export function loadTask(file: string): Task {
  const raw = parse(fs.readFileSync(file, "utf8")) as Task;
  if (!raw.id || !raw.prompt || !raw.checks?.length) {
    throw new Error(`${file}: a task needs at least id, prompt and one check`);
  }
  return { template: "default", resolution: "1280x720", max_steps: 40, ...raw };
}

/** Snapshot ids are remembered per task so `run` can fork without re-preparing. */
export function readSnapshots(): Record<string, string> {
  const p = path.join(config.stateDir, "snapshots.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

export function writeSnapshot(taskId: string, snapshotId: string): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  const all = readSnapshots();
  all[taskId] = snapshotId;
  fs.writeFileSync(path.join(config.stateDir, "snapshots.json"), JSON.stringify(all, null, 2));
}
