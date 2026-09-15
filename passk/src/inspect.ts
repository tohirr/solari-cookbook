/**
 * `passk export-inspect <bench dir> [out.json]` — a saved bench as an Inspect
 * AI eval log (https://inspect.aisi.org.uk/eval-logs.html), so the runs open
 * in `inspect view` next to everything else a team evaluates there.
 *
 * The mapping: the bench is one task with one sample (the prompt); each run
 * is an epoch of that sample; the checks are the scorer, C for a run whose
 * checks all passed and I otherwise; a run lost to infrastructure carries an
 * error and no score, which is how Inspect says "unscored" too. Every step
 * becomes an assistant tool call plus a tool result, so the transcript reads
 * in the viewer's Messages tab; screenshots stay on disk as paths unless
 * --images embeds them as data URLs.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadBench } from "./compare.js";
import { checkLabel } from "./checker.js";
import { lostKind } from "./metrics.js";
import type { BenchResult, RunResult } from "./types.js";

const id = (...parts: string[]) => createHash("sha1").update(parts.join("|")).digest("base64url").slice(0, 22);
const iso = (s: string) => new Date(s).toISOString().replace(/\.\d{3}Z$/, "+00:00");

const STOP: Record<NonNullable<RunResult["stoppedBy"]>, string> = { end_turn: "stop", max_steps: "max_tokens", refusal: "content_filter", error: "unknown", safety_check: "content_filter" };

function sample(b: BenchResult, r: RunResult, dir: string, images: boolean) {
  const runDir = path.join(dir, `run-${String(r.runIndex).padStart(2, "0")}`);
  const lost = lostKind(r);
  const messages: Record<string, unknown>[] = [{ id: id(b.taskId, "input"), role: "user", content: b.prompt.trim(), source: "input" }];
  for (const s of r.steps) {
    const callId = id(b.taskId, String(r.runIndex), String(s.index));
    messages.push({ id: id(callId, "a"), role: "assistant", content: "", source: "generate", tool_calls: [{ id: callId, function: s.name, arguments: (s.input ?? {}) as Record<string, unknown>, type: "function" }] });
    const shot = s.screenshot ? path.join(runDir, s.screenshot) : null;
    const content = shot && images && fs.existsSync(shot)
      ? [{ type: "image", image: `data:image/${path.extname(shot).slice(1) === "png" ? "png" : "jpeg"};base64,${fs.readFileSync(shot).toString("base64")}` }]
      : s.error ? `error: ${s.error}` : shot ? `screenshot: ${shot}` : "OK";
    messages.push({ id: id(callId, "t"), role: "tool", content, tool_call_id: callId, function: s.name, source: "generate", ...(s.error ? { error: { type: "unknown", message: s.error } } : {}) });
  }
  const final = r.finalMessage ?? "";
  if (final) messages.push({ id: id(b.taskId, String(r.runIndex), "final"), role: "assistant", content: final, source: "generate" });
  const usage = { input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, total_tokens: r.usage.inputTokens + r.usage.outputTokens };
  const model = `${b.provenance?.provider ?? "unknown"}/${b.model}`;
  const failed = r.checks.filter((c) => !c.passed);
  const explanation = lost ? `lost to ${lost}: ${r.error ?? ""}` : failed.length ? failed.map((c) => `${checkLabel(c.check)}${c.detail ? `: ${c.detail}` : ""}`).join("\n") : "every check passed inside the VM";
  return {
    id: b.taskId, epoch: r.runIndex + 1, input: b.prompt.trim(), target: "every check passes when evaluated inside the desktop after the agent stops",
    messages,
    output: { model, choices: [{ message: { id: id(b.taskId, String(r.runIndex), "out"), role: "assistant", content: final, source: "generate", model }, stop_reason: STOP[r.stoppedBy ?? "end_turn"] ?? "unknown" }], completion: final, usage, time: r.durationMs / 1000 },
    ...(lost ? { error: { message: r.error ?? `lost to ${lost}`, traceback: "", traceback_ansi: "" } } : {
      scores: { checks: { value: r.status === "passed" ? "C" : "I", answer: r.status, explanation, metadata: { checks: r.checks.map((c) => ({ label: checkLabel(c.check), passed: c.passed, errored: !!c.errored, detail: c.detail ?? null })) }, history: [] } },
    }),
    metadata: { run_index: r.runIndex, session_id: r.sessionId, status: r.status, stopped_by: r.stoppedBy ?? null, error_kind: r.errorKind ?? null, steps: r.steps.length, duration_ms: r.durationMs, cost_usd: r.usage.costUsd ?? null, dir: runDir, final_screenshot: r.finalScreenshot ? path.join(runDir, r.finalScreenshot) : null },
    store: {}, events: [], model_usage: { [model]: usage }, role_usage: {},
    started_at: iso(r.startedAt), completed_at: iso(r.finishedAt), total_time: r.durationMs / 1000, working_time: r.durationMs / 1000,
    uuid: id(b.taskId, b.startedAt, String(r.runIndex)), error_retries: [], attachments: {},
  };
}

export function toInspectLog(b: BenchResult, dir: string, images = false): Record<string, unknown> {
  const m = b.metrics;
  const model = `${b.provenance?.provider ?? "unknown"}/${b.model}`;
  const p = m.passAt1, n = m.n;
  const totals = b.runs.reduce((a, r) => ({ input_tokens: a.input_tokens + r.usage.inputTokens, output_tokens: a.output_tokens + r.usage.outputTokens }), { input_tokens: 0, output_tokens: 0 });
  const metric = (name: string, value: number) => ({ name, value, params: {} });
  return {
    version: 2,
    status: b.status === "running" ? "started" : "success",
    eval: {
      eval_id: id(b.taskId, b.startedAt), run_id: id(dir, b.startedAt), created: iso(b.startedAt),
      task: b.taskId, task_id: b.provenance?.taskHash ?? id(b.taskId), task_version: 0, task_file: `tasks/${b.taskId}.yaml`, task_display_name: b.taskName, task_registry_name: b.taskId,
      task_attribs: {}, task_args: {}, task_args_passed: {},
      dataset: { name: b.taskId, samples: 1, sample_ids: [b.taskId], shuffled: false },
      model, model_generate_config: {}, model_args: {},
      config: { epochs: b.k, fail_on_error: false, continue_on_fail: true, score_on_error: false, log_samples: true, log_images: images },
      packages: { passk: b.provenance?.passkVersion ?? "unknown", ...(b.provenance?.packages ?? {}) },
      scorers: [{ name: "checks", options: {}, metrics: [{ name: "inspect_ai/accuracy", options: {} }, { name: "inspect_ai/stderr", options: {} }], metadata: {} }],
      metadata: { snapshot_id: b.snapshotId, prompt: b.prompt, k: b.k, requested: m.requested, lost: m.lost, pass_at_1: m.passAt1, pass_at_1_lower: m.passAt1Lower, pass_at_1_upper: m.passAt1Upper, pass_pow_5: m.passPowK[5] ?? null, cost_per_success_usd: m.costPerSuccessUsd, total_cost_usd: m.totalCostUsd, provenance: b.provenance ?? null, validation: b.validation ?? null, exported_from: dir },
    },
    plan: { name: "plan", steps: [{ solver: "computer_use_agent", params: { provider: b.provenance?.provider ?? "unknown", max_steps: b.provenance?.task?.max_steps ?? null, effort: b.provenance?.effort ?? null }, params_passed: {} }], config: {} },
    results: {
      total_samples: b.runs.length, completed_samples: b.runs.length,
      scores: [{ name: "checks", scorer: "checks", scored_samples: n, unscored_samples: b.runs.length - n, params: {},
        metrics: { accuracy: metric("accuracy", p), stderr: metric("stderr", n ? Math.sqrt((p * (1 - p)) / n) : 0), pass_at_1_lower: metric("pass_at_1_lower", m.passAt1Lower), pass_at_1_upper: metric("pass_at_1_upper", m.passAt1Upper), pass_pow_5: metric("pass_pow_5", m.passPowK[5] ?? 0) } }],
      headline: { scorer: "checks", score: "checks", metric: "accuracy" },
    },
    stats: { started_at: iso(b.startedAt), completed_at: iso(b.finishedAt), model_usage: { [model]: { ...totals, total_tokens: totals.input_tokens + totals.output_tokens } }, role_usage: {}, connection_limit_history: [] },
    reductions: [{ scorer: "checks", samples: [{ value: p, answer: `${m.passed}/${n}`, explanation: `mean over ${n} scored epochs`, history: [], sample_id: b.taskId }] }],
    samples: b.runs.map((r) => sample(b, r, dir, images)),
  };
}

/**
 * Inspect's own file name, `<created>_<task>_<eval id>.json`: `inspect view`
 * and `inspect log list` recognise logs by it, so a log named anything else
 * is on disk but not on the list.
 */
export function inspectLogName(b: BenchResult): string {
  return `${iso(b.startedAt).replace(/:/g, "-")}_${b.taskId}_${id(b.taskId, b.startedAt)}.json`;
}

export function exportInspect(benchDir: string, out?: string, images = false): { file: string; samples: number; bytes: number } {
  const dir = path.resolve(benchDir);
  const b = loadBench(dir);
  // No destination: next to the bench. A directory: inside it. A file: as given, which the viewer will not list.
  const file = !out ? path.join(dir, inspectLogName(b)) : fs.existsSync(out) && fs.statSync(out).isDirectory() ? path.join(path.resolve(out), inspectLogName(b)) : path.resolve(out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(toInspectLog(b, dir, images), null, images ? 0 : 2);
  fs.writeFileSync(file, json);
  return { file, samples: b.runs.length, bytes: json.length };
}
