/**
 * After `passk run` inside the GitHub Action: the newest bench in the runs
 * directory becomes step outputs and a job summary, so the numbers show on
 * the workflow page without opening the artifact. The exit code passed in
 * is the CLI's (0 gate met, 2 gate missed, 1 crashed) and is reported, not
 * raised; the action's last step raises it after the artifact is uploaded.
 *
 *   tsx scripts/ci-summary.ts <runs dir> <exit code>
 */
import fs from "node:fs";
import path from "node:path";
import { checkLabel } from "../src/checker.js";
import { lostKind } from "../src/metrics.js";
import { verdict } from "../src/report/html.js";
import type { BenchResult } from "../src/types.js";

const [runsDir, codeArg] = process.argv.slice(2);
const code = Number(codeArg ?? "1");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const out = (k: string, v: unknown) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${String(v)}\n`); };
const summary = (md: string) => { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n"); else console.log(md); };

const dirs = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((d) => fs.existsSync(path.join(runsDir, d, "bench.json"))).sort() : [];
const dir = dirs[dirs.length - 1];
if (!dir) {
  summary(`## passk\n\nNo bench was written (exit ${code}). See the step log.`);
  process.exit(0);
}
const b = JSON.parse(fs.readFileSync(path.join(runsDir, dir, "bench.json"), "utf8")) as BenchResult;
const m = b.metrics;
out("passed", m.passed); out("n", m.n); out("requested", m.requested);
out("pass_at_1", m.passAt1.toFixed(4)); out("pass_at_1_lower", m.passAt1Lower.toFixed(4)); out("pass_at_1_upper", m.passAt1Upper.toFixed(4));
out("pass_pow_5", (m.passPowK[Math.min(5, m.n)] ?? 0).toFixed(4)); out("cost_usd", m.totalCostUsd.toFixed(4));
out("bench_dir", path.join(runsDir, dir)); out("report", path.join(runsDir, dir, "report.html"));

const gate = code === 0 ? "✅ gate met" : code === 2 ? "❌ gate missed" : `⚠️ exit ${code}`;
const dots = b.runs.map((r) => (r.status === "passed" ? "✓" : lostKind(r) ? "·" : "×")).join("");
const k5 = Math.min(5, m.n);
const lost = m.errored ? ` · ${m.errored} lost (${[m.lost.solari && `${m.lost.solari} desktop`, m.lost.provider && `${m.lost.provider} provider`, m.lost.verifier && `${m.lost.verifier} verifier`].filter(Boolean).join(", ")}), not scored` : "";
const checks = (m.checks ?? []).filter((c) => c.n).map((c) => ({ ...c, rate: c.passed / c.n })).sort((x, y) => x.rate - y.rate);
const missed = checks.filter((c) => c.passed < c.n);
const failures = b.runs.filter((r) => r.status === "failed");
const hyp = (i: number) => b.failures.find((f) => f.runIndex === i);

const lines = [
  `## passk · ${b.taskName} — ${gate}`,
  "",
  verdict(b).replace(/<\/?b>/g, "**"),
  "",
  `\`${dots}\`${lost}`,
  "",
  "| | |",
  "|---|---|",
  `| passed | **${m.passed}/${m.n}** (pass@1 ${pct(m.passAt1)}, 95% interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}) |`,
  `| pass^${k5} | ${pct(m.passPowK[k5] ?? 0)} estimated, lower bound ${pct(m.passPowKLower[k5] ?? 0)} |`,
  `| steps | median ${m.medianSteps}, range ${m.minSteps}–${m.maxSteps} |`,
  `| model spend | $${m.totalCostUsd.toFixed(2)}${m.costPerSuccessUsd !== null ? `, $${m.costPerSuccessUsd.toFixed(3)} per success` : ""} |`,
  `| model | \`${b.model}\` · snapshot \`${b.snapshotId}\` · k=${b.k} |`,
];
if (checks.length > 1) {
  lines.push("", missed.length ? `**Checks:** ${missed.length} of ${checks.length} failed in at least one run, worst first.` : `**Checks:** all ${checks.length} passed in every scored run.`, "", "| check | passed |", "|---|---|");
  for (const c of (missed.length ? missed : checks).slice(0, 12)) lines.push(`| ${c.label}${c.invariant ? " (guard)" : ""} | ${c.passed}/${c.n} |`);
}
if (failures.length) {
  lines.push("", `**Failed runs:** ${failures.map((r) => `run ${r.runIndex}`).join(", ")}.`);
  for (const r of failures.slice(0, 5)) {
    const bad = r.checks.filter((c) => !c.passed).map((c) => checkLabel(c.check));
    const h = hyp(r.runIndex);
    lines.push(`- run ${r.runIndex}: ${r.steps.length} steps, ${r.stoppedBy === "max_steps" ? "hit the step cap" : r.stoppedBy ?? "stopped"}; missed ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? ` and ${bad.length - 3} more` : ""}${h ? ` — ${h.cause.replace(/_/g, " ")} (${h.confidence} confidence)${h.divergenceStep !== null ? `, diverges at step ${h.divergenceStep}` : ""}` : ""}`);
  }
}
lines.push("", `Report, every check as run, and every screenshot: \`${dir}/report.html\` in the workflow artifact.`);
summary(lines.join("\n"));
