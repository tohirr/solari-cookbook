/**
 * Single-bench report. Reads top to bottom as an argument: the verdict in one
 * sentence, the outcome of every run as a dot, the pass rate with its
 * uncertainty, how the runs spread in effort, then each run with its
 * screenshots and (for failures) a hypothesis. Provenance closes it.
 */
import type { BenchResult, RunResult } from "../types.js";
import { CSS, TIP_JS, dotsHtml, esc, pct, secs, stripHtml, usd } from "./theme.js";

const runDir = (i: number) => `run-${String(i).padStart(2, "0")}`;

/** One sentence a reader can repeat. Written from the numbers, never from the agent's own claims. */
export function verdict(b: BenchResult): string {
  const m = b.metrics;
  const spread = m.maxSteps > 0 && m.maxSteps >= m.minSteps * 2;
  if (m.n === 0) return "No run was scorable: every attempt was lost to infrastructure, the provider, or the verifier.";
  const lostText = [m.lost.solari ? `${m.lost.solari} to desktop infrastructure` : "", m.lost.provider ? `${m.lost.provider} to the model provider` : "", m.lost.verifier ? `${m.lost.verifier} to a checker crash` : ""].filter(Boolean).join(", ");
  const head = `<b>${m.passed} of ${m.n} passed</b>${lostText ? `, ${lostText.replace(/^(\d+)/, "$1 lost")}` : ""}.`;
  if (m.passed === m.n && spread) return `${head} Same outcome every time, but the effort varied from ${m.minSteps} to ${m.maxSteps} steps: the pass rate hides how differently each run got there.`;
  if (m.passed === m.n) return `${head} Consistent in outcome and in effort (${m.minSteps}–${m.maxSteps} steps). With ${m.n} runs the pass rate is at least ${pct(m.passAt1Lower)} at 95% confidence.`;
  if (m.passed === 0) return `${head} The task never succeeded under these conditions; the failures below are hypotheses, not verdicts, because there is no passing run to compare against.`;
  return `${head} Observed pass rate ${pct(m.passAt1)} (95% interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}); the chance that ${Math.min(5, m.n)} runs in a row all pass is about ${pct(m.passPowK[Math.min(5, m.n)] ?? 0)}.`;
}

function runCard(b: BenchResult, r: RunResult): string {
  const f = b.failures.find((x) => x.runIndex === r.runIndex);
  const shots = r.steps.filter((s) => s.screenshot);
  const film = [
    ...shots.map((s) => `<a href="${runDir(r.runIndex)}/${s.screenshot}" target="_blank" class="${f && f.divergenceStep !== null && s.index >= f.divergenceStep && s.index <= (f.divergenceStep + 1) ? "diverge" : ""}"><img loading="lazy" src="${runDir(r.runIndex)}/${s.screenshot}" alt="step ${s.index}"><em>${s.index}</em></a>`),
    r.finalScreenshot ? `<a href="${runDir(r.runIndex)}/${r.finalScreenshot}" target="_blank" class="final"><img loading="lazy" src="${runDir(r.runIndex)}/${r.finalScreenshot}" alt="final"><em>final</em></a>` : "",
  ].join("");
  const stopped = r.stoppedBy && r.stoppedBy !== "end_turn" ? `<span class="pill neutral">${r.stoppedBy === "max_steps" ? "hit step cap" : r.stoppedBy === "safety_check" ? "stopped: safety check" : r.errorKind ? `${r.errorKind} error` : r.stoppedBy}</span>` : "";
  return `<div class="card run">
    <div class="id"><b>Run ${r.runIndex}</b><span class="pill ${r.status}">${r.status}</span> ${stopped}<div style="margin-top:8px">${r.steps.length} steps · ${secs(r.durationMs)}${r.usage.costUsd !== undefined ? ` · ${usd(r.usage.costUsd)}` : ""}</div></div>
    <div>
      <div class="checks">${r.checks.map((c) => `<div><span class="${c.passed ? "ok" : "bad"}">${c.passed ? "✓" : "✗"}</span> ${esc(c.check.type)} ${esc("path" in c.check ? c.check.path : "cmd" in c.check ? `${c.check.cmd} ${(c.check.args ?? []).join(" ")}`.slice(0, 90) : "")}${c.detail ? `<div class="detail">${esc(c.detail.slice(0, 500))}</div>` : ""}</div>`).join("")}${r.error ? `<div class="bad">${esc(r.error)}</div>` : ""}</div>
      ${film ? `<div class="film">${film}</div>` : ""}
      ${f ? `<div class="hyp"><b>Hypothesis: ${esc(f.cause.replace(/_/g, " "))}</b> · ${esc(f.confidence)} confidence${f.divergenceStep !== null ? ` · diverges from the passing reference at step ${f.divergenceStep}` : f.referencePassed ? "" : " · no passing run to compare against"}<div style="margin-top:4px">${esc(f.explanation)}</div></div>` : ""}
      ${r.finalMessage ? `<div class="note">Agent's own claim: “${esc(r.finalMessage.slice(0, 200))}” — not used for grading.</div>` : ""}
      <details><summary>trace (${r.steps.length} actions)</summary><pre>${esc(r.steps.map((s) => `${String(s.index).padStart(2)}  ${s.name.padEnd(16)} ${JSON.stringify(s.input)}${s.error ? "   !! " + s.error : ""}`).join("\n"))}</pre></details>
    </div>
  </div>`;
}

export function renderReport(b: BenchResult): string {
  const m = b.metrics;
  const p = b.provenance ?? {
    passkVersion: "pre-0.1", gitCommit: null, provider: "?", model: b.model, effort: "?", concurrency: 0, node: "?",
    packages: {}, taskHash: "unknown (bench predates provenance capture)", budgetUsd: null,
    task: { id: b.taskId, name: b.taskName, prompt: b.prompt, checks: [] },
  };
  const attempted = b.runs.filter((r) => !(r.status === "errored" && r.steps.length === 0));
  const kShow = Math.min(5, m.n);
  const stepMin = Math.min(...attempted.map((r) => r.steps.length), 0);
  const stepMax = Math.max(...attempted.map((r) => r.steps.length), 1);
  const secMax = Math.max(...attempted.map((r) => r.durationMs / 1000), 1);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · ${esc(b.taskName)}</title><style>${CSS}</style></head><body><main>
<div class="brand"><b>passk</b> reliability bench · outcomes verified inside the VM</div>
<h1>${esc(b.taskName)}</h1>
<div class="meta"><code>${esc(b.model)}</code> · k=${b.k} · snapshot <code>${esc(b.snapshotId)}</code> · ${esc(b.startedAt.slice(0, 16).replace("T", " "))} UTC</div>
<blockquote class="prompt">${esc(b.prompt.trim())}</blockquote>
<p class="verdict">${verdict(b)}</p>

<div class="card">
  ${dotsHtml(b.runs.map((r) => ({ status: r.status, runIndex: r.runIndex, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy })), m.skipped)}
  <div class="legend"><span><i style="background:var(--good)"></i>passed</span><span><i style="background:var(--crit)"></i>failed</span><span><i style="border:2px solid var(--ink-3);width:6px;height:6px"></i>not scored: <b>!</b> desktop infra · <b>M</b> model provider · <b>?</b> checker crash</span>${m.skipped ? `<span><i style="border:2px solid var(--line-2);width:6px;height:6px"></i>skipped for budget</span>` : ""}</div>
  <div class="range" data-tip="observed ${pct(m.passAt1)}, 95% Wilson interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}"><i style="left:${m.passAt1Lower * 100}%;right:${100 - m.passAt1Upper * 100}%"></i><b style="left:${m.passAt1 * 100}%"></b></div>
  <div class="range-labels"><span>0%</span><span>pass rate: observed ${pct(m.passAt1)}, plausible range ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}</span><span>100%</span></div>
</div>

<h2>Numbers</h2>
<div class="kpis">
  <div class="card kpi"><b>${m.passed}/${m.n}</b><span>observed passes</span><span class="sub">pass@1 ${pct(m.passAt1)} · interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}</span></div>
  <div class="card kpi"><b>${pct(m.passPowK[kShow] ?? 0)}</b><span>pass^${kShow} · all ${kShow} in a row</span><span class="sub">lower bound ${pct(m.passPowKLower[kShow] ?? 0)}</span></div>
  <div class="card kpi"><b>${m.passed}/${m.requested}</b><span>end-to-end</span><span class="sub">${m.errored ? [m.lost.solari ? `${m.lost.solari} desktop` : "", m.lost.provider ? `${m.lost.provider} provider` : "", m.lost.verifier ? `${m.lost.verifier} verifier` : ""].filter(Boolean).join(", ") + " lost" : "no runs lost"}${m.skipped ? `, ${m.skipped} skipped` : ""}</span></div>
  <div class="card kpi"><b>${m.medianSteps}</b><span>median steps</span><span class="sub">p95 ${m.p95Steps} · range ${m.minSteps}–${m.maxSteps}</span></div>
  <div class="card kpi"><b>${secs(m.medianDurationMs)}</b><span>median duration</span><span class="sub">p95 ${secs(m.p95DurationMs)}</span></div>
  <div class="card kpi"><b>${usd(m.costPerSuccessUsd)}</b><span>per successful run</span><span class="sub">${usd(m.totalCostUsd, 2)} total model spend</span></div>
</div>

<h2>Effort per run</h2>
<div class="card">
  <div style="color:var(--ink-3);font-size:12px">steps</div>
  ${stripHtml(attempted.map((r) => ({ v: r.steps.length, cls: r.status, tip: `run ${r.runIndex}: ${r.steps.length} steps, ${r.status}` })), m.medianSteps, stepMin, stepMax, "")}
  <div style="color:var(--ink-3);font-size:12px;margin-top:16px">seconds</div>
  ${stripHtml(attempted.map((r) => ({ v: Math.round(r.durationMs / 1000), cls: r.status, tip: `run ${r.runIndex}: ${secs(r.durationMs)}, ${r.status}` })), Math.round(m.medianDurationMs / 1000), 0, Math.ceil(secMax), "s")}
  <div class="note">Every point is one run from the same snapshot. A wide spread on a task that always passes is behavior variability: same result, different routes, different cost.</div>
</div>

<h2>Runs</h2>
<div class="runs">${b.runs.map((r) => runCard(b, r)).join("")}</div>

<div class="foot">
  <div>Grading: a run passes only if every check passes when evaluated inside the desktop after the agent stops. The agent's own report of success is shown but never counted.</div>
  <div style="margin-top:8px">${esc(p.provider)} · ${esc(p.model)} · effort ${esc(p.effort)} · concurrency ${p.concurrency} · passk ${esc(p.passkVersion)}${p.gitCommit ? ` @ ${esc(p.gitCommit)}` : ""} · node ${esc(p.node)} · ${Object.entries(p.packages).map(([k, v]) => `${k}@${v}`).join(", ") || "packages not recorded"}</div>
  <div style="margin-top:4px">task hash <code>${esc(p.taskHash)}</code>${p.budgetUsd !== null ? ` · budget $${p.budgetUsd}` : ""}</div>
  <details><summary>checks as run</summary><pre>${esc(p.task.checks.length ? p.task.checks.map((c) => JSON.stringify(c)).join("\n") : "(not recorded)")}</pre></details>
</div>
<script type="application/json" id="bench">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>
${TIP_JS}
</main></body></html>`;
}
