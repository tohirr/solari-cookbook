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

function detectProvider(): "anthropic" | "openai" {
  const explicit = process.env.PASSK_PROVIDER;
  if (explicit === "anthropic" || explicit === "openai") return explicit;
  if (isSet("ANTHROPIC_API_KEY")) return "anthropic";
  if (isSet("OPENAI_API_KEY")) return "openai";
  throw new Error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env (or PASSK_PROVIDER to pick one).");
}

const DEFAULT_MODEL = { anthropic: "claude-opus-5", openai: "gpt-5.6" } as const;

export const config = {
  version: "0.1.0",
  get solariApiKey() { return need("SOLARI_API_KEY"); },
  get anthropicApiKey() { return need("ANTHROPIC_API_KEY"); },
  get openaiApiKey() { return need("OPENAI_API_KEY"); },
  get provider() { return detectProvider(); },
  get model() { return process.env.PASSK_MODEL ?? DEFAULT_MODEL[detectProvider()]; },
  effort: (process.env.PASSK_EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max",
  concurrency: Number(process.env.PASSK_CONCURRENCY ?? 2),
  /** Rolling idle window for a desktop. Resets on every action. */
  desktopTimeoutMs: 15 * 60_000,
  runsDir: path.resolve("runs"),
  stateDir: path.resolve(".passk"),
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
