/**
 * Generate evidence/index.html: one worked example, end to end. Every number
 * is read from the exported bench and comparison files, so the page cannot
 * say anything the evidence does not: each side's runs as dots, the effort
 * spread, the comparison per check, pass^k under both conditions, and a
 * failing run against the passing run it was diffed with.
 */
import fs from "node:fs";
import path from "node:path";
import { CSS, FONTS, TIP_JS, dotsHtml, esc, pct, usd } from "../src/report/theme.js";
import { CHART_CSS, QUIET_DOTS_CSS, deltaTiles, powKCurve, referenceRun, stepBars, traceCompare } from "../src/report/charts.js";
import type { BenchResult } from "../src/types.js";
import type { Comparison } from "../src/compare.js";

const EV = path.resolve("evidence");
const bench = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "bench.json"), "utf8")) as BenchResult;
const comp = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "compare.json"), "utf8")) as Comparison;

const routing = comp("compare-ticket-routing-prompt");
const A = bench("ticket-routing"), B = bench("ticket-routing-reload");
/** The second example, when its evidence is present: a real app inside the VM, published without frames or post ids. */
const hasBox = fs.existsSync(path.join(EV, "compare-bookmarx-triage-prompt", "compare.json"));
const boxC = hasBox ? comp("compare-bookmarx-triage-prompt") : null;
const boxA = hasBox ? bench("bookmarx-triage") : null, boxB = hasBox ? bench("bookmarx-triage-keep") : null;
const all = fs.readdirSync(EV).filter((d) => fs.existsSync(path.join(EV, d, "bench.json"))).map((d) => [d, bench(d)] as const).sort((a, b) => b[1].metrics.n - a[1].metrics.n);
const allComps = fs.readdirSync(EV).filter((d) => d.startsWith("compare-") && fs.existsSync(path.join(EV, d, "compare.json"))).map((d) => [d, comp(d)] as const);
const scored = all.reduce((n, [, b]) => n + b.metrics.n, 0);
const spend = all.reduce((a, [, b]) => a + b.metrics.totalCostUsd, 0);
const models = new Set(all.map(([, b]) => b.model));

const dots = (b: BenchResult, dir: string) => dotsHtml(b.runs.map((r) => ({ status: r.status, runIndex: r.runIndex, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy })), b.metrics.skipped, "", (i) => `${dir}/report.html#run-${i}`);
const bars = (b: BenchResult, dir: string) => stepBars(b, 520, 110, (i) => `${dir}/report.html#run-${i}`);
const pow = (m: BenchResult["metrics"], k: number) => (m.passPowK as unknown as Record<string, number>)[String(k)] ?? 0;
const featured = A.failures.find((f) => f.divergenceStep !== null) ?? A.failures[0];
const ref = referenceRun(A)!;
const rows = routing.checks ?? [];
const moved = { up: rows.filter((x) => x.delta > 0).length, down: rows.filter((x) => x.delta < 0).length, same: rows.filter((x) => x.delta === 0).length };
const noise = routing.fisherP < 0.05 ? `unlikely to be noise (p = ${routing.fisherP.toFixed(3)})` : `consistent with noise at this sample size (p = ${routing.fisherP.toFixed(2)})`;

const side = (label: "A" | "B", b: BenchResult, dir: string, cls: "a" | "b") => `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="pill ${cls}">${label}</span><b style="font-size:15px">${esc(b.taskName)}</b><a href="${dir}/report.html" style="margin-left:auto;font:12.5px var(--sans);color:var(--ink-3);white-space:nowrap">full report</a></div>
    ${dots(b, dir)}
    <div class="kpis" style="margin-top:14px;grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><b>${b.metrics.passed}/${b.metrics.n}</b><span>passed · ${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)}</span></div>
      <div class="kpi"><b>${b.metrics.medianSteps}</b><span>median steps · ${b.metrics.minSteps}–${b.metrics.maxSteps}</span></div>
      <div class="kpi"><b>${usd(b.metrics.costPerSuccessUsd)}</b><span>per success</span></div>
    </div>
    <div class="cap">steps per run</div>
    ${bars(b, dir)}
  </div>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · a worked example</title>
<meta name="description" content="One computer-use task, forked k times from one Solari desktop snapshot under two prompts, graded inside the VM: every run, the effort spread, the comparison per check, and where a failure diverged.">
${FONTS}
<style>${CSS}${CHART_CSS}${QUIET_DOTS_CSS}
.hero{margin:10px 0 34px}.hero h1{font-size:40px;line-height:1.1;max-width:760px}
.hero p{font-size:17px;color:var(--ink-2);max-width:720px;margin:14px 0 0}
.two>*{min-width:0}
.cap{font:12.5px var(--sans);color:var(--ink-3);margin:14px 0 6px}
.key{display:flex;gap:14px;font:12px var(--sans);color:var(--ink-3);margin-top:2px;flex-wrap:wrap}
.key i{display:inline-block;width:14px;height:0;border-top:2px solid;vertical-align:middle;margin-right:5px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 24px;counter-reset:s}
.steps div{border-top:1px solid var(--line);padding:12px 0 0;font:14px/1.5 var(--sans);color:var(--ink-2)}
.steps div:before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--surface-2);color:var(--ink);font-weight:600;font-size:12px;margin-bottom:8px}
.steps b{display:block;color:var(--ink);margin-bottom:2px}
a.btn{display:inline-block;font:12.5px var(--sans);color:var(--ink);text-decoration:none;border:1px solid var(--line-2);padding:5px 10px;border-radius:999px}
</style></head><body><main>
<div class="brand"><b>passk</b> a worked example · built on Solari · outcomes verified inside the VM</div>
<div class="hero">
  <h1>Your agent passed once. Will it pass again?</h1>
  <p>passk forks one Solari desktop snapshot <i>k</i> times, runs the same agent on every fork, verifies the result inside the VM instead of trusting what the agent says, and reports how reliable it is and why it fails when it does. This page is one task under two prompts: ${scored} scored runs on ${models.size === 1 ? `<code>${esc([...models][0])}</code>` : `${models.size} models`}, ${usd(spend, 2)} of model spend.</p>
  <p class="note" style="font-size:14px;margin-top:12px">These benches were run while building the tool, at small <i>k</i> on a budget model. They show what a bench and a comparison contain; they are not findings about any model, and they will be re-run.</p>
</div>

<h2>The task</h2>
<blockquote class="prompt">${esc(A.prompt.trim())}</blockquote>
<p class="note">A support queue served from inside the desktop: twelve tickets, the account owners on a second page, a three-day rule, two customers called Acme. ${A.provenance.task.checks.length} checks grade one fact each, ${A.provenance.task.checks.filter((c) => c.invariant).length} of them guards on things that must not change; a run passes only if every check passes when read from the app's own state file after the agent stops.</p>

<h2>One snapshot, two prompts, ${A.k} forks each</h2>
<div class="two">${side("A", A, "ticket-routing", "a")}${side("B", B, "ticket-routing-reload", "b")}</div>

<h2>What changing the prompt did</h2>
<div class="two">
  <div class="card">
    <div style="font:13px var(--sans);color:var(--ink-3);margin:2px 0 12px">held fixed: ${routing.heldFixed.map((h) => `<code>${esc(h)}</code>`).join(" ")} · changed: ${routing.changed.map((h) => `<code>${esc(h)}</code>`).join(" ")}</div>
    ${deltaTiles([
      { label: "passed", a: `${A.metrics.passed}/${A.metrics.n}`, b: `${B.metrics.passed}/${B.metrics.n}`, delta: Math.round(routing.delta.passAt1 * 100), unit: " pts", better: "up" },
      { label: `pass^${routing.powK}`, a: pct(pow(A.metrics, routing.powK)), b: pct(pow(B.metrics, routing.powK)), delta: Math.round(routing.delta.passPowK * 100), unit: " pts", better: "up" },
      { label: "median steps", a: String(A.metrics.medianSteps), b: String(B.metrics.medianSteps), delta: routing.delta.medianSteps, better: "down" },
      { label: "$ per success", a: usd(A.metrics.costPerSuccessUsd), b: usd(B.metrics.costPerSuccessUsd), delta: routing.delta.costPerSuccessUsd ?? 0, better: "down", digits: 3 },
    ])}
    <p style="color:var(--ink-2);font-size:14px;margin:14px 0 10px">The pass/fail split is ${noise}. Of the ${rows.length} checks, ${moved.up} did better under B, ${moved.down} did worse and ${moved.same} did not move; median effort went from ${A.metrics.medianSteps} to ${B.metrics.medianSteps} steps against a cap of ${A.provenance.task.max_steps ?? 40}. What a change fixes and what it costs are read off the same table.</p>
    <a class="btn" href="compare-ticket-routing-prompt/compare.html">The comparison page</a>
  </div>
  <div class="card">
    <b style="font-size:15px">By check, where either side missed</b>
    <div style="font:13px var(--sans);color:var(--ink-3);margin:2px 0 10px">A → B, worst on A first · ${rows.filter((x) => x.a.passed === x.a.n && x.b.passed === x.b.n).length} other checks passed every run on both sides</div>
    <table class="checks"><thead><tr><th>check</th><th>A</th><th>B</th><th>Δ</th></tr></thead><tbody>
    ${rows.filter((x) => x.a.passed < x.a.n || x.b.passed < x.b.n).map((x) => `<tr class="${x.delta < 0 ? "miss" : ""}"><td>${esc(x.label)}</td><td class="num">${x.a.passed}/${x.a.n}</td><td class="num">${x.b.passed}/${x.b.n}</td><td class="num delta ${x.delta > 0 ? "up" : x.delta < 0 ? "down" : "flat"}">${x.delta > 0 ? "+" : ""}${Math.round(x.delta * 100)} pts</td></tr>`).join("\n    ")}
    </tbody></table>
  </div>
</div>

<h2>The number a user feels</h2>
<div class="card">
  <div class="cap">pass^k · the chance that k attempts in a row all succeed</div>
  ${powKCurve([{ label: "A · baseline prompt", cls: "a", metrics: A.metrics }, { label: "B · reload-and-confirm prompt", cls: "b", metrics: B.metrics }], 20, 900, 200)}
  <div class="key"><span><i style="border-color:var(--a)"></i>A</span><span><i style="border-color:var(--b)"></i>B</span><span><i style="border-top-style:dashed;border-color:var(--ink-3)"></i>95% lower bound</span></div>
  <div class="note">A ${pct(A.metrics.passAt1)} pass rate is a ${pct(pow(A.metrics, 5))} chance of five clean runs in a row; ${pct(B.metrics.passAt1)} is ${pct(pow(B.metrics, 5))}. The dashed line is what the sample can promise, not what it observed.</div>
</div>

${hasBox && boxC && boxA && boxB ? (() => {
  const rows = boxC.checks ?? [];
  const up = rows.filter((x) => x.delta > 0).length, down = rows.filter((x) => x.delta < 0).length;
  const worst = [...(boxA.metrics.checks ?? [])].filter((c) => c.n).map((c) => ({ ...c, rate: c.passed / c.n })).sort((x, y) => x.rate - y.rate)[0];
  const noiseB = boxC.fisherP < 0.05 ? `unlikely to be noise (p = ${boxC.fisherP.toFixed(3)})` : `consistent with noise at this sample size (p = ${boxC.fisherP.toFixed(2)})`;
  const box = (label: "A" | "B", b: BenchResult, dir: string, cls: "a" | "b") => `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="pill ${cls}">${label}</span><b style="font-size:15px">${esc(b.taskName)}</b><a href="${dir}/report.html" style="margin-left:auto;font:12.5px var(--sans);color:var(--ink-3);white-space:nowrap">full report</a></div>
    ${dots(b, dir)}
    <div class="kpis" style="margin-top:14px;grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><b>${b.metrics.passed}/${b.metrics.n}</b><span>passed · ${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)}</span></div>
      <div class="kpi"><b>${b.metrics.medianSteps}</b><span>median steps · ${b.metrics.minSteps}–${b.metrics.maxSteps}</span></div>
      <div class="kpi"><b>${usd(b.metrics.costPerSuccessUsd)}</b><span>per success</span></div>
    </div>
  </div>`;
  return `<h2>A second example: a real app, inside the VM</h2>
<p class="note" style="max-width:var(--measure);font-size:15px">${esc(boxA.taskName)}: <a href="https://bookmarx.space">bookmarx</a>, a search over saved posts, runs inside the desktop as static pages and a stdlib server over a slice of its library. The review queue holds ${(boxA.provenance.task.checks ?? []).length - 2} posts; the rules say to remove nine and the eight guards look risky and are clean. One check per fact, named by category. The frames and the post ids do not leave the run: the bench is published without either, graded from the decisions map itself.</p>
<div class="two">${box("A", boxA, "bookmarx-triage", "a")}${box("B", boxB, "bookmarx-triage-keep", "b")}</div>
<div class="two" style="margin-top:16px">
  <div class="card">
    <div style="font:13px var(--sans);color:var(--ink-3);margin:2px 0 12px">held fixed: ${boxC.heldFixed.map((h) => `<code>${esc(h)}</code>`).join(" ")} · changed: ${boxC.changed.map((h) => `<code>${esc(h)}</code>`).join(" ")}</div>
    ${deltaTiles([
      { label: "passed", a: `${boxA.metrics.passed}/${boxA.metrics.n}`, b: `${boxB.metrics.passed}/${boxB.metrics.n}`, delta: Math.round(boxC.delta.passAt1 * 100), unit: " pts", better: "up" },
      { label: "median steps", a: String(boxA.metrics.medianSteps), b: String(boxB.metrics.medianSteps), delta: boxC.delta.medianSteps, better: "down" },
      { label: "$ per success", a: usd(boxA.metrics.costPerSuccessUsd), b: usd(boxB.metrics.costPerSuccessUsd), delta: boxC.delta.costPerSuccessUsd ?? 0, better: "down", digits: 3 },
    ])}
    <p style="color:var(--ink-2);font-size:14px;margin:14px 0 10px">The pass/fail split is ${noiseB}: ${up} checks did better under B, ${down} did worse. What the table does say is where the baseline's ${boxA.metrics.passed}/${boxA.metrics.n} comes from — ${(boxA.metrics.checks ?? []).filter((c) => c.passed === c.n).length} of ${(boxA.metrics.checks ?? []).length} checks hold in every run, and the one that does not, <b>${esc(worst?.label ?? "")}</b>, holds in ${worst?.passed}/${worst?.n}.</p>
    <a class="btn" href="compare-bookmarx-triage-prompt/compare.html">The comparison page</a>
  </div>
  <div class="card">
    <b style="font-size:15px">By check, where either side missed</b>
    <div style="font:13px var(--sans);color:var(--ink-3);margin:2px 0 10px">A → B, worst on A first · ${rows.filter((x) => x.a.passed === x.a.n && x.b.passed === x.b.n).length} other checks passed every run on both sides</div>
    <table class="checks"><thead><tr><th>check</th><th>A</th><th>B</th><th>Δ</th></tr></thead><tbody>
    ${rows.filter((x) => x.a.passed < x.a.n || x.b.passed < x.b.n).map((x) => `<tr class="${x.delta < 0 ? "miss" : ""}"><td>${esc(x.label)}</td><td class="num">${x.a.passed}/${x.a.n}</td><td class="num">${x.b.passed}/${x.b.n}</td><td class="num delta ${x.delta > 0 ? "up" : x.delta < 0 ? "down" : "flat"}">${x.delta > 0 ? "+" : ""}${Math.round(x.delta * 100)} pts</td></tr>`).join("\n    ")}
    </tbody></table>
  </div>
</div>
`; })() : ""}
<h2>Where a failure diverges</h2>
<div class="card">
  <p style="margin:0 0 14px;color:var(--ink-2);font-size:14px">Run ${ref.runIndex} and run ${featured.runIndex} of condition A on one time axis: same snapshot, same prompt, same model. The outlined step is where they first part ways. Under the final screens, what the agent reported beside what the checker read from the app's state file inside the VM.</p>
  ${traceCompare(A, featured, ref.runIndex, "ticket-routing")}
</div>

<h2>How it works</h2>
<div class="steps">
  <div><b>Prepare</b>boot a template, run the task's setup once, snapshot, kill</div>
  <div><b>Validate</b>on one fork, the checks must fail untouched and pass after the golden steps, or no bench</div>
  <div><b>Run ×k</b>fork the snapshot, agent loop on each fork, checks inside the VM</div>
  <div><b>Report</b>pass@1 with its interval, pass^k, effort and cost per run, a hypothesis per failure</div>
  <div><b>Compare</b>change one thing, fork the same snapshot again, measure the delta per check</div>
</div>

<h2>Every comparison</h2>
<div class="card" style="padding:0;overflow-x:auto"><table>
<tr><th>Comparison</th><th>Changed</th><th class="num">A</th><th class="num">B</th><th class="num">Median steps</th><th class="num">Fisher p</th></tr>
${allComps.map(([d, c]) => `<tr><td><a href="${d}/compare.html">${esc(c.a.taskName)}</a></td><td>${c.changed.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td><td class="num">${c.a.metrics.passed}/${c.a.metrics.n}</td><td class="num">${c.b.metrics.passed}/${c.b.metrics.n}</td><td class="num">${c.a.metrics.medianSteps} → ${c.b.metrics.medianSteps}</td><td class="num">${c.fisherP.toFixed(3)}</td></tr>`).join("")}
</table></div>

<h2>Every bench</h2>
<div class="card" style="padding:0;overflow-x:auto"><table>
<tr><th>Bench</th><th>Model</th><th class="num">Passed</th><th class="num">Pass rate (95%)</th><th class="num">pass^5</th><th class="num">Median steps</th><th class="num">$/success</th><th class="num">Lost</th></tr>
${all.map(([d, b]) => `<tr><td><a href="${d}/report.html">${esc(b.taskName)}</a></td><td><code>${esc(b.model)}</code></td><td class="num">${b.metrics.passed}/${b.metrics.n}</td><td class="num">${pct(b.metrics.passAt1)} (${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)})</td><td class="num">${pct(pow(b.metrics, Math.min(5, b.metrics.n)))}</td><td class="num">${b.metrics.medianSteps}</td><td class="num">${usd(b.metrics.costPerSuccessUsd)}</td><td class="num">${b.metrics.errored || ""}</td></tr>`).join("")}
</table></div>
<div class="note">Observed counts with 95% Wilson intervals. Runs lost to infrastructure, the model provider, or a checker crash are listed, not scored. Hover any dot or bar for the run.</div>

<div class="foot">
  <div>Source, tasks, tests and this evidence: <a href="https://github.com/tohirr/solari-cookbook/tree/main/passk">github.com/tohirr/solari-cookbook</a> · built for the Solari challenge by <a href="https://github.com/tohirr">Tohir</a>. The ticket tool is a mock on purpose: a mock lets the bench own the state, plant a trap, and verify exactly.</div>
</div>
${TIP_JS}
</main></body></html>`;
fs.writeFileSync(path.join(EV, "index.html"), html);
console.log(`showcase: evidence/index.html (${(html.length / 1024).toFixed(0)} KB)`);
