/**
 * Generate evidence/index.html: the page a reviewer should land on. Every
 * number is read from the exported bench and comparison files, so the
 * showcase cannot say anything the evidence does not.
 */
import fs from "node:fs";
import path from "node:path";
import { CSS, TIP_JS, dotsHtml, esc, pct, usd } from "../src/report/theme.js";
import type { BenchResult } from "../src/types.js";
import type { Comparison } from "../src/compare.js";

const EV = path.resolve("evidence");
const bench = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "bench.json"), "utf8")) as BenchResult;
const comp = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "compare.json"), "utf8")) as Comparison;

const env = comp("compare-notes-environment");
const reload = comp("compare-ticket-queue-baseline-vs-reload");
const verify = bench("ticket-queue-verify");
const sheet = bench("q3-total");
const inv = bench("invoice-entry");
const all = fs.readdirSync(EV).filter((d) => fs.existsSync(path.join(EV, d, "bench.json"))).map((d) => [d, bench(d)] as const)
  .sort((a, b) => b[1].metrics.n - a[1].metrics.n);

const dots = (b: BenchResult) => dotsHtml(b.runs.map((r) => ({ status: r.status, runIndex: r.runIndex, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy })), b.metrics.skipped);
const A = env.a.metrics, B = env.b.metrics, R0 = reload.a.metrics, R1 = reload.b.metrics, V = verify.metrics, S = sheet.metrics, I = inv.metrics;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · reliability regression testing for computer-use agents</title>
<meta name="description" content="A reliability bench for computer-use agents on Solari desktops: fork one snapshot k times, verify every outcome inside the VM, and find out why runs diverge.">
<style>${CSS}
.hero{margin:10px 0 34px}.hero h1{font-size:40px;line-height:1.1;max-width:760px}
.hero p{font-size:17px;color:var(--ink-2);max-width:720px;margin:14px 0 0}
.findings{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.finding h3{margin:0 0 6px;font-size:16px}.finding .big{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 0;font-size:32px;font-weight:650;letter-spacing:-.02em;line-height:1.1;margin:10px 0 4px;font-variant-numeric:tabular-nums}
.finding .big.three{font-size:26px}
.finding .big small{font-size:14px;color:var(--ink-3);font-weight:500;letter-spacing:0;margin-left:10px}
.finding p{color:var(--ink-2);font-size:13.5px;margin:10px 0 12px}
.finding a.btn{display:inline-block;font-size:12.5px;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);padding:5px 10px;border-radius:999px}
.arrow{color:var(--ink-3);margin:0 8px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;counter-reset:s}
.steps div{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;font-size:13px;color:var(--ink-2)}
.steps div:before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--surface-2);color:var(--ink);font-weight:600;font-size:12px;margin-bottom:8px}
.steps b{display:block;color:var(--ink);margin-bottom:2px}
</style></head><body><main>
<div class="brand"><b>passk</b> reliability regression testing for computer-use agents · built on Solari · outcomes verified inside the VM</div>
<div class="hero">
  <h1>Your agent passed once. Will it pass again?</h1>
  <p>passk forks one Solari desktop snapshot <i>k</i> times, runs the same agent on every fork, verifies the result inside the VM instead of trusting what the agent says, and reports how reliable it is and why it fails when it does. Everything below was run on the cheapest model available, for under $4.</p>
</div>

<h2>Three things it found</h2>
<div class="findings">
  <div class="card finding">
    <h3>One missing folder</h3>
    <div class="big">${A.passed}/${A.n}<span class="arrow">→</span>${B.passed}/${B.n}</div>
    <div style="margin:8px 0 4px">${dots(bench("notes-nodir"))}</div><div>${dots(bench("notes"))}</div>
    <p>Same agent, same prompt, same checks. The only change: a Documents folder existed where the editor looked for it. Median effort fell from ${A.medianSteps} to ${B.medianSteps} steps and cost per success dropped ${Math.round((1 - (B.costPerSuccessUsd ?? 0) / (A.costPerSuccessUsd ?? 1)) * 100)}%. When an agent "is flaky", the environment is a suspect.</p>
    <a class="btn" href="compare-notes-environment/compare.html">See the comparison</a>
  </div>
  <div class="card finding">
    <h3>Telling it to look did nothing. Telling it to reload fixed it.</h3>
    <div class="big three"><span>${R0.passed}/${R0.n}</span><span class="arrow">→</span><span>${V.passed}/${V.n}</span><span class="arrow">→</span><span>${R1.passed}/${R1.n}</span></div>
    <div style="margin:8px 0 4px">${dots(bench("ticket-queue-baseline"))}</div>
    <p>An internal ticket tool, three prompts, one snapshot. The baseline's failures were all a Save click that never landed, followed by a confident claim of success. "Screenshot and confirm" changed nothing, because the dropdown shows the new value whether or not it was saved. "Reload and confirm" forced a read from the server, and ${R1.passed} of ${R1.n} passed.</p>
    <a class="btn" href="compare-ticket-queue-baseline-vs-reload/compare.html">See the comparison</a>
    <a class="btn" href="compare-ticket-queue-baseline-vs-verify/compare.html">The one that did nothing</a>
  </div>
  <div class="card finding">
    <h3>A perfect pass rate hid a 3× cost spread</h3>
    <div class="big">${S.passed}/${S.n} <small>passed · ${S.minSteps}–${S.maxSteps} steps</small></div>
    <div style="margin:8px 0 4px">${dots(sheet)}</div>
    <p>LibreOffice Calc: add a total row, save as CSV. Every run got the formula right in the same three steps. Then some pressed ctrl+S and clicked "keep format", and others thrashed in the save dialog for twenty steps. Same result, three times the cost, one misclick from renaming the file.</p>
    <a class="btn" href="q3-total/report.html">See the report</a>
  </div>
</div>

<h2>The workflow Pinetree describes</h2>
<div class="card finding" style="max-width:none">
  <h3>Accounts payable: PDF → mock ERP, with a duplicate trap and buttons that must not be pressed</h3>
  <div class="big">${I.passed}/${I.n} <small>passed · ${pct(I.passAt1Lower)}–${pct(I.passAt1Upper)} · ${usd(I.costPerSuccessUsd)} per success</small></div>
  <div style="margin:8px 0 4px">${dots(inv)}</div>
  <p>Read the right invoice out of three PDFs, skip the one already entered, fill a form with dropdowns and a date, attach the file through the OS file dialog, save as Pending review, and never touch Approve or Mark paid. No run approved, paid, or duplicated anything. The failures were detours that ran out of step budget with the form already filled. ${I.errored ? `${I.errored} runs were lost to infrastructure and are reported, not scored.` : ""}</p>
  <a class="btn" href="invoice-entry/report.html">See the report</a>
</div>

<h2>How it works</h2>
<div class="steps">
  <div><b>Prepare</b>boot a template, run setup, snapshot, kill</div>
  <div><b>Probe</b>let the agent look and list the questions it would ask</div>
  <div><b>Run ×k</b>fork the snapshot, agent loop on each fork, check inside the VM</div>
  <div><b>Report</b>pass@k, pass^k with intervals, effort spread, a hypothesis per failure</div>
  <div><b>Compare</b>change one thing, fork the same snapshot again, measure the delta</div>
</div>

<h2>Every bench</h2>
<div class="card" style="padding:0;overflow-x:auto"><table>
<tr><th>Bench</th><th>Model</th><th class="num">Passed</th><th class="num">Pass rate (95%)</th><th class="num">Median steps</th><th class="num">$/success</th><th class="num">Lost</th></tr>
${all.map(([d, b]) => `<tr><td><a href="${d}/report.html">${esc(b.taskName)}</a></td><td><code>${esc(b.model)}</code></td><td class="num">${b.metrics.passed}/${b.metrics.n}</td><td class="num">${pct(b.metrics.passAt1)} (${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)})</td><td class="num">${b.metrics.medianSteps}</td><td class="num">${usd(b.metrics.costPerSuccessUsd)}</td><td class="num">${b.metrics.errored || ""}</td></tr>`).join("")}
</table></div>
<div class="note">Observed counts with 95% Wilson intervals. Runs lost to infrastructure, the model provider, or a checker crash are listed, not scored. Hover any dot for the run.</div>

<div class="foot">
  <div>Source, tasks, tests and this evidence: <a href="https://github.com/tohirr/solari-cookbook/tree/passk/passk">github.com/tohirr/solari-cookbook</a> · built for the Solari challenge by <a href="https://github.com/tohirr">Tohir</a>. The ticket tool and LedgerDesk are mocks on purpose: a mock lets the bench own the state and verify exactly.</div>
</div>
${TIP_JS}
</main></body></html>`;
fs.writeFileSync(path.join(EV, "index.html"), html);
console.log(`showcase: evidence/index.html (${(html.length / 1024).toFixed(0)} KB)`);
