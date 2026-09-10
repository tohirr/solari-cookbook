/**
 * Single-bench report. Reads top to bottom as an argument: the verdict in one
 * sentence, one reliability card (every run as a dot, the pass rate with its
 * uncertainty), the supporting numbers, how the runs spread in effort, then
 * the runs. Past ten runs the report behaves like a decision document rather
 * than a telemetry dump: failed and lost runs come first with their
 * screenshots and hypothesis expanded, and passed runs collapse to one line
 * each. Provenance closes it.
 */
import { checkLabel, checkRaw } from "../checker.js";
import { lostKind, percentile } from "../metrics.js";
import type { BenchResult, RunResult } from "../types.js";
import { CSS, TIP_JS, dotsHtml, esc, pct, secs, stripHtml, tailStat, usd } from "./theme.js";

const runDir = (i: number) => `run-${String(i).padStart(2, "0")}`;

/** Past this many runs, passed runs collapse to a line and failures lead. Below it every run is shown in full, in order. */
const COLLAPSE_AT = 10;

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

function stoppedPill(r: RunResult): string {
  if (!r.stoppedBy || r.stoppedBy === "end_turn") return "";
  const text = r.stoppedBy === "max_steps" ? "hit step cap" : r.stoppedBy === "safety_check" ? "stopped: safety check" : r.errorKind ? `${r.errorKind} error` : r.stoppedBy;
  return `<span class="pill neutral">${esc(text)}</span>`;
}

function runCard(b: BenchResult, r: RunResult, id: boolean): string {
  const f = b.failures.find((x) => x.runIndex === r.runIndex);
  const shots = r.steps.filter((s) => s.screenshot);
  const film = [
    ...shots.map((s) => `<a href="${runDir(r.runIndex)}/${s.screenshot}" target="_blank" class="${f && f.divergenceStep !== null && s.index >= f.divergenceStep && s.index <= (f.divergenceStep + 1) ? "diverge" : ""}"><img loading="lazy" src="${runDir(r.runIndex)}/${s.screenshot}" alt="step ${s.index}"><em>${s.index}</em></a>`),
    r.finalScreenshot ? `<a href="${runDir(r.runIndex)}/${r.finalScreenshot}" target="_blank" class="final"><img loading="lazy" src="${runDir(r.runIndex)}/${r.finalScreenshot}" alt="final"><em>final</em></a>` : "",
  ].join("");
  const checks = r.checks.map((c) => {
    const label = esc(checkLabel(c.check));
    // A named check shows its name; the raw assertion sits in the title for audit and in "checks as run" at the foot.
    const named = c.check.name ? `<span class="raw" title="${esc(checkRaw(c.check))}">raw</span>` : "";
    return `<div><span class="${c.passed ? "ok" : "bad"}">${c.passed ? "✓" : "✗"}</span> ${label}${named}${c.detail ? `<div class="detail">${esc(c.detail.slice(0, 500))}</div>` : ""}</div>`;
  }).join("");
  return `<div class="card run"${id ? ` id="run-${r.runIndex}"` : ""}>
    <div class="id"><b>Run ${r.runIndex}</b><span class="pill ${r.status}">${r.status}</span> ${stoppedPill(r)}<div style="margin-top:8px">${r.steps.length} steps · ${secs(r.durationMs)}${r.usage.costUsd !== undefined ? ` · ${usd(r.usage.costUsd)}` : ""}</div></div>
    <div>
      <div class="checks">${checks}${r.error ? `<div class="bad">${esc(r.error)}</div>` : ""}</div>
      ${film ? `<div class="film">${film}</div>` : ""}
      ${f ? `<div class="hyp"><b>Hypothesis: ${esc(f.cause.replace(/_/g, " "))}</b> · ${esc(f.confidence)} confidence${f.divergenceStep !== null ? ` · diverges from the passing reference at step ${f.divergenceStep}` : f.referencePassed ? "" : " · no passing run to compare against"}<div style="margin-top:4px">${esc(f.explanation)}</div></div>` : ""}
      ${r.finalMessage ? `<div class="note">Agent's own claim: “${esc(r.finalMessage.slice(0, 200))}” — not used for grading.</div>` : ""}
      <details><summary>trace (${r.steps.length} actions)</summary><pre>${esc(r.steps.map((s) => `${String(s.index).padStart(2)}  ${s.name.padEnd(16)} ${JSON.stringify(s.input)}${s.error ? "   !! " + s.error : ""}`).join("\n"))}</pre></details>
    </div>
  </div>`;
}

/** A passed run folded to one line; the full card (screenshots, checks, trace) opens on demand or when a dot links here. */
function runRow(b: BenchResult, r: RunResult): string {
  return `<details class="runrow" id="run-${r.runIndex}"><summary><b>Run ${r.runIndex}</b><span class="pill ${r.status}">${r.status}</span> ${stoppedPill(r)}<span>${r.steps.length} steps</span><span>${secs(r.durationMs)}</span>${r.usage.costUsd !== undefined ? `<span>${usd(r.usage.costUsd)}</span>` : ""}<span class="more">screenshots, checks, trace</span></summary>${runCard(b, r, false)}</details>`;
}

function runsSection(b: BenchResult): string {
  if (b.runs.length <= COLLAPSE_AT) return `<h2>Runs</h2>\n<div class="runs">${b.runs.map((r) => runCard(b, r, true)).join("")}</div>`;
  const rank = (r: RunResult) => (r.status === "failed" ? 0 : lostKind(r) ? 2 : 1); // agent failures, then agent errors, then lost runs
  const attention = b.runs.filter((r) => r.status !== "passed").sort((x, y) => rank(x) - rank(y) || x.runIndex - y.runIndex);
  const passed = b.runs.filter((r) => r.status === "passed");
  return `<h2>Runs needing attention${attention.length ? ` (${attention.length})` : ""}</h2>
${attention.length ? `<div class="runs">${attention.map((r) => runCard(b, r, true)).join("")}</div>` : `<div class="note">None: every attempted run passed.</div>`}
<h2>Passed runs (${passed.length})</h2>
<div class="runs">${passed.map((r) => runRow(b, r)).join("")}</div>`;
}

export function renderReport(b: BenchResult): string {
  const m = b.metrics;
  const p = b.provenance ?? {
    passkVersion: "pre-0.1", gitCommit: null, provider: "?", model: b.model, effort: "?", concurrency: 0, node: "?",
    packages: {}, taskHash: "unknown (bench predates provenance capture)", budgetUsd: null,
    task: { id: b.taskId, name: b.taskName, prompt: b.prompt, checks: [] },
  };
  const attempted = b.runs.filter((r) => !(r.status === "errored" && r.steps.length === 0));
  const scorable = b.runs.filter((r) => lostKind(r) === null);
  const kShow = Math.min(5, m.n);
  const stepMin = Math.min(...attempted.map((r) => r.steps.length), 0);
  const stepMax = Math.max(...attempted.map((r) => r.steps.length), 1);
  const secMax = Math.max(...attempted.map((r) => r.durationMs / 1000), 1);

  // Tail statistics only when the sample can carry them (see tailStat).
  const tail = tailStat(m.n);
  const stepsSorted = scorable.map((r) => r.steps.length).sort((x, y) => x - y);
  const secsSorted = scorable.map((r) => r.durationMs).sort((x, y) => x - y);
  const stepsSub = tail ? `${tail.label} ${Math.round(percentile(stepsSorted, tail.p))} · range ${m.minSteps}–${m.maxSteps}` : `range ${m.minSteps}–${m.maxSteps}`;
  const durSub = tail ? `${tail.label} ${secs(percentile(secsSorted, tail.p))} · range ${secs(secsSorted[0] ?? 0)}–${secs(secsSorted[secsSorted.length - 1] ?? 0)}` : `range ${secs(secsSorted[0] ?? 0)}–${secs(secsSorted[secsSorted.length - 1] ?? 0)}`;

  const lostBits = [m.lost.solari ? `${m.lost.solari} desktop` : "", m.lost.provider ? `${m.lost.provider} provider` : "", m.lost.verifier ? `${m.lost.verifier} verifier` : ""].filter(Boolean).join(", ");
  const endToEnd = m.errored || m.skipped
    ? `<div class="card kpi"><b>${m.passed}/${m.requested}</b><span>end-to-end</span><span class="sub">${m.errored ? `${lostBits} lost` : ""}${m.errored && m.skipped ? ", " : ""}${m.skipped ? `${m.skipped} skipped for budget` : ""}</span></div>`
    : ""; // identical to observed passes when nothing was lost; saying it twice adds nothing

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · ${esc(b.taskName)}</title><style>${CSS}</style></head><body><main>
<div class="brand"><b>passk</b> reliability test · outcomes verified inside the VM</div>
<h1>${esc(b.taskName)}</h1>
<div class="meta"><code>${esc(b.model)}</code> · k=${b.k} · snapshot <code>${esc(b.snapshotId)}</code> · ${esc(b.startedAt.slice(0, 16).replace("T", " "))} UTC</div>
<blockquote class="prompt">${esc(b.prompt.trim())}</blockquote>
<p class="verdict">${verdict(b)}</p>

<div class="card">
  <div class="headline"><b>${m.passed}/${m.n} passed</b><span>pass@1 ${pct(m.passAt1)} · 95% interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}${m.errored ? ` · ${m.errored} of ${m.requested} requested runs lost before they could be scored` : ""}</span></div>
  ${dotsHtml(b.runs.map((r) => ({ status: r.status, runIndex: r.runIndex, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy })), m.skipped, "", (i) => `#run-${i}`)}
  <div class="legend"><span><i style="background:var(--good)"></i>✓ passed</span><span><i style="background:var(--crit)"></i>× failed</span><span><i style="border:2px solid var(--ink-3);width:6px;height:6px"></i>not scored: <b>!</b> desktop infra · <b>M</b> model provider · <b>?</b> checker crash</span>${m.skipped ? `<span><i style="border:2px solid var(--line-2);width:6px;height:6px"></i>skipped for budget</span>` : ""}<span>click a dot for the run</span></div>
  <div class="range" data-tip="observed ${pct(m.passAt1)}, 95% Wilson interval ${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)}"><i style="left:${m.passAt1Lower * 100}%;right:${100 - m.passAt1Upper * 100}%"></i><b style="left:${m.passAt1 * 100}%"></b></div>
  <div class="range-labels"><span>0%</span><span>where the true pass rate plausibly sits (95% Wilson interval)</span><span>100%</span></div>
</div>

<h2>Numbers</h2>
<div class="kpis">
  <div class="card kpi"><b>${pct(m.passPowK[kShow] ?? 0)}</b><span>pass^${kShow} · all ${kShow} in a row</span><span class="sub">lower bound ${pct(m.passPowKLower[kShow] ?? 0)}</span></div>
  ${endToEnd}
  <div class="card kpi"><b>${m.medianSteps}</b><span>median steps</span><span class="sub">${stepsSub}</span></div>
  <div class="card kpi"><b>${secs(m.medianDurationMs)}</b><span>median duration</span><span class="sub">${durSub}</span></div>
  <div class="card kpi"><b>${usd(m.costPerSuccessUsd)}</b><span>per success</span><span class="sub">all scored spend ÷ passes · ${usd(m.totalCostUsd, 2)} total${m.costPerPassingRunUsd !== null && m.costPerPassingRunUsd !== undefined ? ` · ${usd(m.costPerPassingRunUsd)} per passing run` : ""}</span></div>
</div>

<h2>Effort per run</h2>
<div class="card">
  <div style="color:var(--ink-3);font-size:12px">steps</div>
  ${stripHtml(attempted.map((r) => ({ v: r.steps.length, cls: r.status, tip: `run ${r.runIndex}: ${r.steps.length} steps, ${r.status}` })), m.medianSteps, stepMin, stepMax, "")}
  <div style="color:var(--ink-3);font-size:12px;margin-top:16px">seconds</div>
  ${stripHtml(attempted.map((r) => ({ v: Math.round(r.durationMs / 1000), cls: r.status, tip: `run ${r.runIndex}: ${secs(r.durationMs)}, ${r.status}` })), Math.round(m.medianDurationMs / 1000), 0, Math.ceil(secMax), "s")}
  <div class="note">Every point is one run from the same snapshot. A wide spread on a task that always passes is behavior variability: same result, different routes, different cost.</div>
</div>

${runsSection(b)}

<div class="foot">
  <div>Grading: a run passes only if every check passes when evaluated inside the desktop after the agent stops. The agent's own report of success is shown but never counted.</div>
  <div style="margin-top:8px">${esc(p.provider)} · ${esc(p.model)} · effort ${esc(p.effort)} · concurrency ${p.concurrency} · passk ${esc(p.passkVersion)}${p.gitCommit ? ` @ ${esc(p.gitCommit)}${p.gitDirty ? " (dirty tree)" : ""}` : ""}${p.safety ? ` · safety ${esc(p.safety)}` : ""}${p.systemPromptHash ? ` · system prompt ${esc(p.systemPromptHash)}` : ""} · node ${esc(p.node)} · ${Object.entries(p.packages).map(([k, v]) => `${k}@${v}`).join(", ") || "packages not recorded"}</div>
  <div style="margin-top:4px">task hash <code>${esc(p.taskHash)}</code>${p.budgetUsd !== null ? ` · budget $${p.budgetUsd}` : ""}</div>
  ${b.validation ? `<div style="margin-top:4px">verifier validated before the bench: ${esc(b.validation.notes.join("; "))}</div>` : ""}
  <details><summary>checks as run</summary><pre>${esc(p.task.checks.length ? p.task.checks.map((c) => JSON.stringify(c)).join("\n") : "(not recorded)")}</pre></details>
</div>
<script type="application/json" id="bench">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>
${TIP_JS}
<script>
(function(){function open(){var id=location.hash.slice(1),el=id&&document.getElementById(id);if(el&&el.tagName==='DETAILS'){el.open=true;el.scrollIntoView();}}addEventListener('hashchange',open);open();})();
</script>
</main></body></html>`;
}
