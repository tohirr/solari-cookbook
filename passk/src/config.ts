import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parse } from "yaml";
import { Ajv, type ErrorObject } from "ajv";
import type { Task } from "./types.js";

const require = createRequire(import.meta.url);
const validateTaskFile = new Ajv({ allErrors: true }).compile(require("../schema/task.schema.json"));

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

/**
 * Ajv reports every branch of a oneOf that failed, so one bad check yields a
 * dozen lines from branches the author never meant. Pick the branch the
 * author meant (a check by its `type`, a step by its key) and report only
 * that branch's complaints; an unknown type or step key is its own message.
 */
function schemaProblems(errors: ErrorObject[], raw: unknown): string[] {
  const schema = require("../schema/task.schema.json") as { properties: { checks: { items: { oneOf: { properties: { type: { const: string } } }[] } }; setup: { items: { oneOf: { required: string[] }[] } } } };
  const checkBranches = schema.properties.checks.items.oneOf, stepBranches = schema.properties.setup.items.oneOf;
  const doc = (raw ?? {}) as Record<string, unknown>;
  const out = new Set<string>();
  for (const e of errors) {
    if (e.keyword === "oneOf") continue;
    // /checks/3/... → the check's type picks the branch; /setup/2/... or /golden/0/... → the step's key does.
    const m = e.instancePath.match(/^\/(checks|setup|golden)\/(\d+)/);
    if (m) {
      const list = (doc[m[1]] as Record<string, unknown>[] | undefined) ?? [];
      const item = list[Number(m[2])] ?? {};
      const branch = m[1] === "checks"
        ? checkBranches.findIndex((b) => b.properties.type.const === item.type)
        : stepBranches.findIndex((b) => b.required[0] in item);
      if (branch === -1) {
        out.add(m[1] === "checks"
          ? `  /${m[1]}/${m[2]} unknown check type ${JSON.stringify(item.type)}; one of ${checkBranches.map((b) => b.properties.type.const).join(", ")}`
          : `  /${m[1]}/${m[2]} not a step; a step starts with one of ${stepBranches.map((b) => b.required[0]).join(", ")}`);
        continue;
      }
      if (!e.schemaPath.includes(`/oneOf/${branch}/`)) continue;
    }
    const extra = "additionalProperty" in e.params ? ` (${String(e.params.additionalProperty)})` : "";
    out.add(`  ${e.instancePath || "/"} ${e.message}${extra}`);
  }
  return [...out];
}

/**
 * Parse a task file and refuse it before anything billable if it does not
 * match schema/task.schema.json: the same schema the editor uses, so what
 * completes in VS Code is what runs.
 */
export function loadTask(file: string): Task {
  const raw = parse(fs.readFileSync(file, "utf8")) as Task;
  if (!validateTaskFile(raw)) {
    throw new Error(`${file} is not a valid passk task:\n${schemaProblems(validateTaskFile.errors ?? [], raw).join("\n")}`);
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
