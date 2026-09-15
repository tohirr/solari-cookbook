import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parse } from "yaml";
import { Ajv, type ErrorObject } from "ajv";
import type { SetupStep, Task } from "./types.js";

const require = createRequire(import.meta.url);
const taskSchema = require("../schema/task.schema.json") as { properties: { setup: { items: object } } };
const validateTaskFile = new Ajv({ allErrors: true }).compile(taskSchema);
/** The setup-step branch of the same schema, on its own, so an include is refused for the same reasons a task would be. */
const validateSteps = new Ajv({ allErrors: true }).compile({ type: "array", items: taskSchema.properties.setup.items });

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

function detectProvider(): "anthropic" | "openai" | "scripted" | "custom" {
  // Your own agent module (PASSK_AGENT=path) is the agent, whatever keys are around; it may use any model or none.
  if (process.env.PASSK_AGENT) return "custom";
  const explicit = process.env.PASSK_PROVIDER;
  if (explicit === "anthropic" || explicit === "openai" || explicit === "scripted") return explicit;
  if (isSet("ANTHROPIC_API_KEY")) return "anthropic";
  if (isSet("OPENAI_API_KEY")) return "openai";
  throw new Error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env (or PASSK_PROVIDER to pick one).");
}

const DEFAULT_MODEL = { anthropic: "claude-opus-5", openai: "gpt-5.6", scripted: "scripted", custom: "custom" } as const;

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

/** One `setup_from` entry: a file of steps, and values for the `${name}` placeholders in it. */
type Include = string | { file: string; with?: Record<string, string> };

/**
 * Read a setup include: a YAML list of steps, or a document with a `setup:`
 * list. The steps are validated against the same schema branch as a task's
 * own, so a typo in a shared file fails at load, not on a booted desktop.
 */
function readInclude(file: string): SetupStep[] {
  const doc = parse(fs.readFileSync(file, "utf8")) as unknown;
  const steps = Array.isArray(doc) ? doc : (doc as { setup?: unknown } | null)?.setup;
  if (!Array.isArray(steps)) throw new Error(`${file} is not a setup include: expected a list of steps, or a document with a \`setup:\` list`);
  if (!validateSteps(steps)) throw new Error(`${file} is not a valid setup include:\n${(validateSteps.errors ?? []).map((e) => `  ${e.instancePath || "/"} ${e.message}`).join("\n")}`);
  return steps as SetupStep[];
}

/**
 * Fill an include's `${name}` placeholders from its `with:` block. Every
 * placeholder must be given a value: an unresolved one would reach the guest
 * as literal text and fail somewhere far less obvious. Shell expansions in an
 * included step must therefore be written `$NAME`, not `${NAME}`.
 */
function substitute<T>(node: T, vars: Record<string, string>, file: string): T {
  if (typeof node === "string") {
    return node.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
      if (!(name in vars)) throw new Error(`${file}: nothing supplies \${${name}}; add it under \`with:\` in the task's setup_from`);
      return vars[name];
    }) as T;
  }
  if (Array.isArray(node)) return node.map((v) => substitute(v, vars, file)) as T;
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, substitute(v, vars, file)])) as T;
  }
  return node;
}

/**
 * Every `upload:` source a task names, from its own steps and from anything
 * `setup_from` pulled in, that is not on this machine. Sources are read
 * relative to the working directory, the way `prepare` reads them. A task
 * whose files are built rather than committed — an export, a fixture too
 * large or too private for git — would otherwise boot a desktop, run setup,
 * and die on ENOENT with the bill already paid.
 */
function missingUploads(task: Task): string[] {
  const steps = [...(task.setup ?? []), ...(task.golden ?? [])];
  return steps.flatMap((s) => ("upload" in s && !fs.existsSync(s.upload) ? [s.upload] : []));
}

/**
 * Parse a task file and refuse it before anything billable if it does not
 * match schema/task.schema.json: the same schema the editor uses, so what
 * completes in VS Code is what runs. `setup_from` includes are resolved here,
 * against the task file's directory, so everything downstream — the snapshot,
 * the task hash, the bench's own record of what it ran — sees one flat list
 * of steps and never has to know a file was shared.
 */
export function loadTask(file: string): Task {
  const raw = parse(fs.readFileSync(file, "utf8")) as Task & { setup_from?: Include | Include[] };
  if (!validateTaskFile(raw)) {
    throw new Error(`${file} is not a valid passk task:\n${schemaProblems(validateTaskFile.errors ?? [], raw).join("\n")}`);
  }
  const { setup_from, ...task } = raw;
  const includes = setup_from === undefined ? [] : Array.isArray(setup_from) ? setup_from : [setup_from];
  const shared = includes.flatMap((inc) => {
    const spec = typeof inc === "string" ? { file: inc, with: {} } : inc;
    const p = path.resolve(path.dirname(file), spec.file);
    return substitute(readInclude(p), spec.with ?? {}, p);
  });
  const setup = shared.length ? [...shared, ...(task.setup ?? [])] : task.setup;
  const built: Task = { template: "default", resolution: "1280x720", max_steps: 40, ...task, ...(setup ? { setup } : {}) };
  const missing = missingUploads(built);
  if (missing.length) {
    // A README beside a missing file is where its build step is written down.
    const lines = missing.map((m) => {
      const readme = path.join(path.dirname(m), "README.md");
      return `  ${m}${fs.existsSync(readme) ? ` — how to build it: ${readme}` : ""}`;
    });
    throw new Error(`${file} uploads files that are not on this machine:\n${lines.join("\n")}\nPaths are read relative to the working directory (${process.cwd()}).`);
  }
  return built;
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
