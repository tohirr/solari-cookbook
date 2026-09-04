/**
 * Everything a reader needs to trust or reproduce a bench. Model aliases
 * drift, checks get stricter, defaults change: the bench carries its own
 * task definition, a hash of it, and the versions that produced it.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { config } from "./config.js";
import type { Check, Provenance, Task } from "./types.js";

const require = createRequire(import.meta.url);

/** Stable hash of a task: keys sorted, so formatting changes don't count; check names dropped, so labelling a check doesn't either. */
export function taskHash(task: Task): string {
  return createHash("sha256").update(canonical({ ...task, checks: unlabelled(task.checks) })).digest("hex").slice(0, 16);
}

/** Checks without their display names: what grading actually depends on. */
export function unlabelled(checks: Check[]): Check[] {
  return checks.map(({ name: _name, ...c }) => c as Check);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function pkgVersion(name: string): string {
  try { return (require(`${name}/package.json`) as { version: string }).version; } catch { return "unknown"; }
}

function gitCommit(): string | null {
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; }
}

export function collectProvenance(task: Task, concurrency: number, budgetUsd: number | null): Provenance {
  return {
    passkVersion: pkgVersion("../package.json") === "unknown" ? (require("../package.json") as { version: string }).version : pkgVersion("../package.json"),
    gitCommit: gitCommit(),
    provider: config.provider,
    model: config.model,
    effort: config.effort,
    concurrency,
    node: process.version,
    packages: {
      "@solarisdk/sdk": pkgVersion("@solarisdk/sdk"),
      "@anthropic-ai/sdk": pkgVersion("@anthropic-ai/sdk"),
      openai: pkgVersion("openai"),
    },
    taskHash: taskHash(task),
    task,
    budgetUsd,
  };
}
