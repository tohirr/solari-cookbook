/**
 * Generate passk/index.html: the front door. A landing page in the report's
 * own theme, with every number read from the exported benches and
 * comparisons, so the pitch cannot claim anything the evidence does not.
 * One picture per facet: a dot grid once, then a pass^k curve, a trace of
 * where a failure diverged, rate bars, delta tiles and effort bars.
 *
 *   npx tsx scripts/landing.ts        # from passk/
 */
import fs from "node:fs";
import path from "node:path";
import { CSS, TIP_JS, dotsHtml, esc, pct, usd } from "../src/report/theme.js";
import { CHART_CSS, QUIET_DOTS_CSS, causeBar, deltaTiles, powKCurve, rateBars, referenceRun, stepBars, traceCompare } from "../src/report/charts.js";
import { runsForLowerBound, wilson } from "../src/metrics.js";
import type { BenchResult } from "../src/types.js";
import type { Comparison } from "../src/compare.js";

const EV = path.resolve("evidence");
const bench = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "bench.json"), "utf8")) as BenchResult;
const comp = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "compare.json"), "utf8")) as Comparison;

const all = fs.readdirSync(EV).filter((d) => fs.existsSync(path.join(EV, d, "bench.json"))).map((d) => [d, bench(d)] as const)
  .sort((a, b) => b[1].metrics.n - a[1].metrics.n);
const compares = fs.readdirSync(EV).filter((d) => fs.existsSync(path.join(EV, d, "compare.json")));

const reload = comp("compare-ticket-queue-baseline-vs-reload");
const env = comp("compare-notes-environment");
const base = bench("ticket-queue-baseline"), fixed = bench("ticket-queue-reload"), verify = bench("ticket-queue-verify");
const notes = bench("notes"), nodir = bench("notes-nodir");
const sheet = bench("q3-total");
const inv = bench("invoice-entry");
const R0 = reload.a.metrics, R1 = reload.b.metrics, A = env.a.metrics, B = env.b.metrics, V = verify.metrics, S = sheet.metrics, I = inv.metrics;

const totalRuns = all.reduce((s, [, b]) => s + b.runs.length, 0);
const totalSpend = all.reduce((s, [, b]) => s + b.metrics.totalCostUsd, 0);
const tasks = new Set(all.map(([, b]) => b.taskId)).size;
const templates = new Set(all.map(([, b]) => b.provenance?.task?.template ?? "default")).size;
const models = Array.from(new Set(all.map(([, b]) => b.model)));
const allFailures = all.flatMap(([, b]) => b.failures);

const dots = (b: BenchResult, dir: string) => dotsHtml(
  b.runs.map((r) => ({ status: r.status, runIndex: r.runIndex, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy })),
  b.metrics.skipped, "", (i) => `evidence/${dir}/report.html#run-${i}`);
const bars = (b: BenchResult, dir: string, h = 120, w = 520) => stepBars(b, w, h, (i) => `evidence/${dir}/report.html#run-${i}`);

const pow = (m: BenchResult["metrics"], k: number) => (m.passPowK as unknown as Record<string, number>)[String(k)] ?? 0;
const dp = Math.round(reload.delta.passAt1 * 100);

// The failure to show: the first in the baseline with a divergence point, against the run the diff used.
const featured = base.failures.find((f) => f.divergenceStep !== null) ?? base.failures[0];
const ref = referenceRun(base)!;

/** What k all-passing runs can prove, and how many runs a floor needs. */
const proofRows = [5, 10, 20, 30, 50].map((k) => ({ k, lower: wilson(k, k).lower }));
const floors = [0.7, 0.8, 0.9, 0.95].map((f) => ({ f, need: runsForLowerBound(f) }));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · does your computer-use agent pass twice?</title>
<meta name="description" content="Reliability regression testing for computer-use agents. Fork one Solari desktop snapshot k times, run the same agent on every fork, verify inside the VM, and learn why runs diverge.">
<meta property="og:title" content="passk · does your computer-use agent pass twice?">
<meta property="og:description" content="Reliability regression testing for computer-use agents, with ${totalRuns} verified runs published as evidence.">
<meta property="og:image" content="https://tohirr.github.io/solari-cookbook/passk/docs/compare-ticket-queue.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%2322c55e'/%3E%3Cpath d='M9 16l5 5 9-10' stroke='%230e0f12' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}${CHART_CSS}${QUIET_DOTS_CSS}
:root{--sans:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;--mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--accent:#f5c518;--accent-ink:#141306}
body{font-size:15px;line-height:1.55}
main{padding:0 28px 80px}
.wrap{max-width:1120px;margin:0 auto}
h2{margin:0 0 18px}
.sec{padding:80px 0 0}
.sec .lead{font-size:26px;line-height:1.25;letter-spacing:-.02em;font-weight:600;max-width:760px;margin:0 0 10px}
.sec .lead+p{color:var(--ink-2);max-width:680px;margin:0 0 28px;font-size:15.5px}
.bar{position:sticky;top:0;z-index:5;background:rgba(14,15,18,.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.bar .in{max-width:1120px;margin:0 auto;padding:0 28px;height:58px;display:flex;align-items:center;gap:22px}
.bar .logo{font-weight:700;font-size:15px;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:9px}
.bar .logo i{width:12px;height:12px;border-radius:50%;background:var(--good);display:inline-block}
.bar nav{display:flex;gap:2px;margin-left:6px}
.bar nav a{color:var(--ink-2);text-decoration:none;font-size:13.5px;padding:6px 10px;border-radius:8px;white-space:nowrap}
.bar nav a:hover{color:var(--ink);background:var(--surface-2)}
.bar .right{margin-left:auto;display:flex;gap:8px}
@media(max-width:760px){.bar nav{display:none}}
.btn{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);background:transparent;padding:10px 16px;border-radius:10px;cursor:pointer;font-family:var(--sans);line-height:1}
.btn:hover{background:var(--surface-2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.06)}
.btn.sm{font-size:13px;padding:7px 12px}
.btn code{font:13px var(--mono);color:inherit}
.hero{padding:96px 0 56px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:56px;align-items:center}
@media(max-width:960px){.hero{grid-template-columns:1fr;padding-top:56px;gap:36px}}
.hero>*{min-width:0}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2);border:1px solid var(--line-2);border-radius:999px;padding:5px 12px 5px 8px;margin-bottom:22px}
.eyebrow i{width:8px;height:8px;border-radius:50%;background:var(--good);display:inline-block;box-shadow:0 0 0 3px var(--good-dim)}
.hero h1{font-size:52px;line-height:1.02;letter-spacing:-.035em;font-weight:600;margin:0 0 20px;max-width:560px}
@media(max-width:560px){.hero h1{font-size:38px}}
.hero .sub{font-size:17.5px;line-height:1.5;color:var(--ink-2);max-width:520px;margin:0 0 28px}
.hero .sub b{color:var(--ink);font-weight:600}
.cta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.fine{color:var(--ink-3);font-size:12.5px}
.fine a{color:var(--ink-2)}
.proof{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px 24px;box-shadow:0 30px 80px -40px rgba(0,0,0,.8)}
.proof .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.proof .top b{font-size:15px;font-weight:600}
.proof .top span{font-size:12px;color:var(--ink-3);font-family:var(--mono)}
.proof .row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:14px 0 4px}
.proof .row .k{font-size:12.5px;color:var(--ink-2)}.proof .row .k b{display:block;font-size:24px;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.05}
.proof .cap{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin:16px 0 6px}
.proof .cap b{color:var(--ink-2);font-weight:600;letter-spacing:0;text-transform:none;font-size:12.5px}
.proof .key{display:flex;gap:14px;font-size:11.5px;color:var(--ink-3);margin-top:2px}
.proof .key i{display:inline-block;width:14px;height:0;border-top:2px solid;vertical-align:middle;margin-right:5px}
.proof .verdict{font-size:13.5px;color:var(--ink-2);margin:16px 0 0;padding-top:14px;border-top:1px solid var(--line);line-height:1.5}
.proof .verdict b{color:var(--ink);font-weight:600}
.proof .verdict ins{background:var(--good-dim);color:var(--good);text-decoration:none;border-radius:3px;padding:0 3px}
.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);overflow:hidden}
.totals div{padding:18px 20px;border-left:1px solid var(--line);font-size:12.5px;color:var(--ink-3)}
.totals div:first-child{border-left:0}
.totals b{display:block;font-size:28px;font-weight:600;letter-spacing:-.025em;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.05;margin-bottom:6px}
.findings{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.finding{display:flex;flex-direction:column}
.finding h3{margin:0 0 6px;font-size:16px;font-weight:600;letter-spacing:-.01em}
.finding .big{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 0;font-size:30px;font-weight:600;letter-spacing:-.025em;line-height:1.1;margin:6px 0 10px;font-variant-numeric:tabular-nums}
.finding .big.three{font-size:24px}
.finding .big small{font-size:13px;color:var(--ink-3);font-weight:500;letter-spacing:0;margin-left:10px}
.finding p{color:var(--ink-2);font-size:14px;margin:12px 0 14px;flex:1}
.finding .actions{display:flex;gap:8px;flex-wrap:wrap}
.arrow{color:var(--ink-3);margin:0 8px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;counter-reset:s}
.steps div{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;font-size:13.5px;color:var(--ink-2)}
.steps div:before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--surface-2);color:var(--ink);font-weight:600;font-size:12px;margin-bottom:10px}
.steps b{display:block;color:var(--ink);margin-bottom:3px;font-size:15px}
.code{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 20px;font:13px/1.7 var(--mono);color:var(--ink-2);white-space:pre;overflow-x:auto;margin:0}
.code i{font-style:normal;color:var(--ink-3)}
.code b{font-weight:500;color:var(--ink)}
.split>*,.end>*,.prove>*,.hero>*,.two>*{min-width:0}
@media(max-width:560px){.code{white-space:pre-wrap;overflow-wrap:anywhere}}
.split{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
@media(max-width:860px){.split{grid-template-columns:1fr}}
.prove{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.prove{grid-template-columns:1fr}}
.prove .card{padding:0;overflow-x:auto}
.prove .card>div{padding:14px 18px 4px;font-size:13px;color:var(--ink-2)}
.prove .card>div b{color:var(--ink)}
.faq{display:grid;gap:0;border-top:1px solid var(--line)}
.faq details{margin:0;border-bottom:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;font-size:16px;font-weight:600;color:var(--ink);letter-spacing:-.01em}
.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:"+";color:var(--ink-3);font-weight:400;font-size:20px;flex:none}
.faq details[open] summary:after{content:"−"}
.faq p{margin:0 0 18px;color:var(--ink-2);font-size:14.5px;max-width:760px}
.faq code{font:13px var(--mono);color:var(--ink)}
.end{margin-top:80px;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:44px 40px;display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center}
@media(max-width:860px){.end{grid-template-columns:1fr;padding:32px 24px}}
.end h2{font-size:32px;letter-spacing:-.03em;text-transform:none;color:var(--ink);font-weight:600;margin:0 0 12px;line-height:1.1}
.end p{color:var(--ink-2);margin:0 0 22px;max-width:460px}
.foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:40px}
</style></head><body>
<div class="bar"><div class="in">
  <a class="logo" href="./"><i></i>passk</a>
  <nav><a href="#diverge">Why it failed</a><a href="#proof">Findings</a><a href="#how">How it works</a><a href="#prove">What k proves</a><a href="#faq">FAQ</a><a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/METHOD.md">Method</a></nav>
  <div class="right"><a class="btn sm" href="https://github.com/tohirr/solari-cookbook/tree/main/passk">GitHub</a><a class="btn sm primary" href="studio/">Open the studio</a></div>
</div></div>
<main><div class="wrap">

<section class="hero">
  <div>
    <div class="eyebrow"><i></i>Reliability regression testing for computer-use agents</div>
    <h1>Your agent passed once. Will it pass twice?</h1>
    <p class="sub">passk forks one Solari desktop snapshot <b>k</b> times, runs the same agent on every fork, verifies the outcome <b>inside the VM</b> instead of trusting what the agent says, and tells you how reliable it is and why it fails when it does.</p>
    <div class="cta"><a class="btn primary" href="studio/">Open the studio</a><a class="btn" href="evidence/index.html">Read the evidence</a><a class="btn" href="https://github.com/tohirr/solari-cookbook/tree/main/passk#setup"><code>sh demo.sh</code> · 40s, no API spend</a></div>
    <div class="fine">${tasks} tasks · ${templates} Solari templates · ${totalRuns} verified runs · ${usd(totalSpend, 2)} of model spend in total, all on <code>${esc(models.join(", "))}</code>. Every number and picture on this page is read from <a href="evidence/">the published bench files</a>.</div>
  </div>
  <div class="proof" id="hero-proof">
    <div class="top"><b>${esc(base.taskName)}</b><span>${base.metrics.n} forks of one snapshot · ${esc(base.model)}</span></div>
    <div class="row">${dots(base, "ticket-queue-baseline")}<div class="k"><b>${R0.passed}/${R0.n}</b>passed · ${pct(R0.passAt1Lower)}–${pct(R0.passAt1Upper)} plausible</div></div>
    <div class="cap"><b>pass^k</b> · the chance all k attempts succeed</div>
    ${powKCurve([{ label: "baseline prompt", cls: "a", metrics: R0 }, { label: "reload-and-confirm prompt", cls: "b", metrics: R1 }], 20, 520, 170)}
    <div class="key"><span><i style="border-color:var(--a)"></i>A · baseline</span><span><i style="border-color:var(--b)"></i>B · same snapshot, prompt adds “reload and confirm”</span><span><i style="border-top-style:dashed;border-color:var(--ink-3)"></i>95% lower bound</span></div>
    <div class="cap">What changing the prompt did</div>
    ${deltaTiles([
      { label: "passed", a: `${R0.passed}/${R0.n}`, b: `${R1.passed}/${R1.n}`, delta: dp, unit: " pts", better: "up" },
      { label: `pass^${reload.powK}`, a: pct(pow(R0, reload.powK)), b: pct(pow(R1, reload.powK)), delta: Math.round(reload.delta.passPowK * 100), unit: " pts", better: "up" },
      { label: "median steps", a: String(R0.medianSteps), b: String(R1.medianSteps), delta: reload.delta.medianSteps, better: "down" },
    ])}
    <p class="verdict">A ${pct(R0.passAt1)} pass rate is a ${pct(pow(R0, 10))} chance of ten clean runs in a row. Adding <ins>reload the page and confirm</ins> to the prompt moved it to <b>${R1.passed}/${R1.n}</b>, at the cost of ${reload.delta.medianSteps > 0 ? `+${reload.delta.medianSteps}` : reload.delta.medianSteps} median steps. On this many runs the pass/fail split alone is ${reload.fisherP < 0.05 ? "unlikely to be noise" : "still consistent with noise"} (p = ${reload.fisherP.toFixed(2)}). <a href="evidence/compare-ticket-queue-baseline-vs-reload/compare.html">Full comparison ↗</a></p>
  </div>
</section>

<div class="totals">
  <div><b>${totalRuns}</b>verified runs, each graded inside the VM</div>
  <div><b>${tasks}</b>validated tasks across ${templates} desktop templates</div>
  <div><b>${compares.length}</b>controlled comparisons, one thing changed each</div>
  <div><b>${usd(totalSpend, 2)}</b>total model spend for everything on this page</div>
</div>

<section class="sec" id="diverge">
  <h2>Why it failed</h2>
  <p class="lead">Every failing run is diffed against a passing sibling to find the first step where they part ways.</p>
  <p>Below, run ${ref.runIndex} and run ${featured.runIndex} of the baseline bench on one time axis. Same snapshot, same prompt, same model. The agent's own report of the outcome sits next to what the checker found in the VM.</p>
  <div class="card">${traceCompare(base, featured, ref.runIndex, "evidence/ticket-queue-baseline")}</div>
  <div class="card" style="margin-top:14px"><h3 style="margin:0 0 4px;font-size:16px">Every failure in the evidence, by cause</h3>
    <div style="font-size:13.5px;color:var(--ink-2)">${allFailures.length} failing runs across ${all.length} benches, sorted into Pinetree's three sources of unreliability by a model reading the diff. The label is a hypothesis; the divergence step and the screenshots are the evidence.</div>
    ${causeBar(allFailures)}</div>
</section>

<section class="sec" id="proof">
  <h2>Three things it found</h2>
  <p class="lead">A single demo tells you an agent <em>can</em> do the task. Fifty forks tell you what it does on a Tuesday.</p>
  <p>Each finding below is one snapshot, one agent, one thing changed, and every run's outcome checked by a script in the VM rather than by the agent's own report.</p>
  <div class="findings">
    <div class="card finding">
      <h3>One missing folder</h3>
      <div class="big">${A.passed}/${A.n}<span class="arrow">→</span>${B.passed}/${B.n}</div>
      ${deltaTiles([
        { label: "median steps", a: String(A.medianSteps), b: String(B.medianSteps), delta: env.delta.medianSteps, better: "down" },
        { label: "$ per success", a: usd(A.costPerSuccessUsd), b: usd(B.costPerSuccessUsd), delta: env.delta.costPerSuccessUsd ?? 0, better: "down", digits: 3 },
      ])}
      <p>Same agent, same prompt, same checks. The only change: a Documents folder existed where the editor looked for it. When an agent "is flaky", the environment is a suspect.</p>
      <div class="actions"><a class="btn sm" href="evidence/compare-notes-environment/compare.html">See the comparison</a></div>
    </div>
    <div class="card finding">
      <h3>Telling it to look did nothing. Telling it to reload fixed it.</h3>
      ${rateBars([{ label: "baseline", passed: R0.passed, n: R0.n, cls: "a" }, { label: "screenshot + confirm", passed: V.passed, n: V.n, cls: "n" }, { label: "reload + confirm", passed: R1.passed, n: R1.n, cls: "b" }], 520, 190)}
      <p>An internal ticket tool, three prompts, one snapshot. Every baseline failure was a Save click that never landed, followed by a confident claim of success. "Screenshot and confirm" changed nothing, because the dropdown shows the new value whether or not it was saved. "Reload and confirm" forced a read from the server.</p>
      <div class="actions"><a class="btn sm" href="evidence/compare-ticket-queue-baseline-vs-reload/compare.html">Reload</a><a class="btn sm" href="evidence/compare-ticket-queue-baseline-vs-verify/compare.html">Screenshot</a></div>
    </div>
    <div class="card finding">
      <h3>A perfect pass rate hid a 3× cost spread</h3>
      <div class="big">${S.passed}/${S.n} <small>passed · ${S.minSteps}–${S.maxSteps} steps</small></div>
      ${bars(sheet, "q3-total", 130)}
      <p>LibreOffice Calc: add a total row, save as CSV. Every run got the formula right in three steps. Then some pressed ctrl+S and clicked "keep format", and others thrashed in the save dialog for twenty. Same result, three times the cost.</p>
      <div class="actions"><a class="btn sm" href="evidence/q3-total/report.html">See the report</a></div>
    </div>
  </div>
  <div class="card finding" style="margin-top:14px">
    <h3>The workflow Pinetree describes: accounts payable, with a duplicate trap and buttons that must not be pressed</h3>
    <div class="big">${I.passed}/${I.n} <small>passed · ${pct(I.passAt1Lower)}–${pct(I.passAt1Upper)} plausible · ${usd(I.costPerSuccessUsd)} per success · ${I.minSteps}–${I.maxSteps} steps</small></div>
    ${bars(inv, "invoice-entry", 150, 1060)}
    <p>Read the right invoice out of three PDFs, skip the one already entered, fill a form with dropdowns and a date, attach the file through the OS file dialog, save as Pending review, and never touch Approve or Mark paid. No run approved, paid or duplicated anything. The failures are the tall red bars: detours that ran out of step budget with the form already filled.${I.errored ? ` ${I.errored} runs were lost to infrastructure and are reported, not scored.` : ""}</p>
    <div class="actions"><a class="btn sm" href="evidence/invoice-entry/report.html">See the report</a></div>
  </div>
</section>

<section class="sec" id="how">
  <h2>How it works</h2>
  <p class="lead">Snapshot once. Fork k times. Verify inside the VM. Diff the failures against a passing sibling.</p>
  <p>Built on Solari because it is the only place this is cheap: <code>snapshot()</code> once, <code>createDesktop({ fromSnapshot })</code> k times, and every fork boots byte-identical in about a second.</p>
  <div class="steps">
    <div><b>Prepare</b>boot a template, run the setup steps, snapshot, kill</div>
    <div><b>Validate</b>prove the checks fail before the golden steps and pass after</div>
    <div><b>Probe</b>let the agent look around and list the questions it would ask a human</div>
    <div><b>Run ×k</b>fork the snapshot, agent loop on each fork, checks graded in the VM</div>
    <div><b>Report</b>pass@k and pass^k with intervals, effort spread, a cause per failure</div>
    <div><b>Compare</b>change one thing, fork the same snapshot again, measure the delta</div>
  </div>
  <div class="split" style="margin-top:16px">
    <pre class="code"><i># one task, start to finish</i>
passk prepare  tasks/notes.yaml      <i># boot → setup → snapshot → kill</i>
passk validate tasks/notes.yaml      <i># is the verifier sound?</i>
passk probe    tasks/notes.yaml      <i># what would the agent ask?</i>
passk run      tasks/notes.yaml --k 10 --budget 0.50 --require-lower 0.7
open runs/notes-*/report.html</pre>
    <pre class="code"><i># what the report says</i>
<b>pass@1</b>   observed pass rate, with a 95% Wilson interval
<b>pass^k</b>   probability that all k attempts pass: the number a user feels
<b>effort</b>   steps, seconds and dollars per run, and their spread
<b>cause</b>    each failure diffed against a passing sibling, then sorted
         into stochastic execution, task ambiguity or behavior
         variability (Pinetree, 2026)</pre>
  </div>
</section>

<section class="sec" id="prove">
  <h2>What k can prove</h2>
  <p class="lead">Ten passes out of ten does not mean 100%. It means at least ${pct(wilson(10, 10).lower)}.</p>
  <p>passk reports the interval, not just the count, and the studio's planner works this out before you spend anything. The two tables below are the same arithmetic the reports use.</p>
  <div class="prove">
    <div class="card"><div>If <b>all k runs pass</b>, the pass rate is at least…</div>
      <table><tr><th class="num">k</th><th class="num">lower bound (95%)</th><th class="num">pass^5 at that bound</th></tr>
      ${proofRows.map((r) => `<tr><td class="num">${r.k}</td><td class="num">${pct(r.lower)}</td><td class="num">${pct(Math.pow(r.lower, 5))}</td></tr>`).join("")}</table></div>
    <div class="card"><div>To <b>establish a floor</b>, this many runs must all pass</div>
      <table><tr><th class="num">floor</th><th class="num">runs needed</th><th class="num">the CLI flag</th></tr>
      ${floors.map((f) => `<tr><td class="num">${pct(f.f)}</td><td class="num">${f.need}</td><td class="num"><code>--require-lower ${f.f}</code></td></tr>`).join("")}</table></div>
  </div>
</section>

<section class="sec" id="benches">
  <h2>Every bench</h2>
  <p class="lead">All of it is published: every action, check, screenshot and provenance record.</p>
  <div class="card" style="padding:0;overflow-x:auto"><table>
  <tr><th>Bench</th><th>Model</th><th class="num">Passed</th><th class="num">Pass rate (95%)</th><th class="num">pass^5</th><th class="num">Median steps</th><th class="num">$/success</th><th class="num">Lost</th></tr>
  ${all.map(([d, b]) => `<tr><td><a href="evidence/${d}/report.html">${esc(b.taskName)}</a></td><td><code>${esc(b.model)}</code></td><td class="num">${b.metrics.passed}/${b.metrics.n}</td><td class="num">${pct(b.metrics.passAt1)} (${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)})</td><td class="num">${pct(pow(b.metrics, Math.min(5, b.metrics.n)))}</td><td class="num">${b.metrics.medianSteps}</td><td class="num">${usd(b.metrics.costPerSuccessUsd)}</td><td class="num">${b.metrics.errored || ""}</td></tr>`).join("")}
  </table></div>
  <div class="note">Observed counts with 95% Wilson intervals. Runs lost to infrastructure, the model provider or a checker crash are listed, not scored. <a href="evidence/index.html">The showcase</a> walks through each result; <a href="studio/">the studio</a> lets you browse and plan.</div>
</section>

<section class="sec" id="faq">
  <h2>Questions</h2>
  <div class="faq">
    <details><summary>What is pass^k, and why not just pass@1?</summary><p>pass@1 is the chance one attempt succeeds. pass^k is the chance <em>all k</em> attempts succeed, which is what a user who runs the agent five times a day actually experiences. An agent at 80% pass@1 is at 33% pass^5. Both are estimated without bias from the runs, and reported with a lower bound.</p></details>
    <details><summary>Who is it for?</summary><p>Teams shipping computer-use agents. An engineer defines a task and its success criteria once in a YAML file; passk runs it repeatedly from the same state and produces a report that engineering, product and operations can all read. The operator is an agent or QA engineer. The report reader does not need to know what YAML is.</p></details>
    <details><summary>Why are the apps mocks?</summary><p>On purpose. A mock lets the bench own the state, plant a trap and verify exactly: the ticket queue and LedgerDesk keep their state in a JSON file a checker script reads inside the VM. What they keep from the real thing is the shape: records to search, a duplicate to avoid, required fields, dropdowns, a file upload, a business rule, and a consequential action that must not happen.</p></details>
    <details><summary>Which agents can it bench?</summary><p>An OpenAI Responses API loop and a Claude computer-use loop ship in <code>src/agent/</code>; <code>PASSK_PROVIDER</code> picks one. Add a file there to bench your own. Everything published here ran on the OpenAI loop with a budget model; the Claude loop is written but was unexercised for want of a working key at the time.</p></details>
    <details><summary>What does it cost?</summary><p>Model spend for every number on this page was ${usd(totalSpend, 2)}. Fifty runs of the ticket queue cost about a dollar on a budget model, because the app lives in the snapshot and every fork boots in about a second. Solari's free tier allows one concurrent desktop; <code>--budget</code> stops a bench at a dollar figure and <code>--require-lower</code> makes it a CI gate.</p></details>
    <details><summary>What can it not do?</summary><p>It cannot tell you an agent is reliable from five runs; it will tell you that five passes prove at least ${pct(wilson(5, 5).lower)}, and how many runs the floor you want needs. It does not fix the agent. It does not write the verifier for you, and the verifier is the hard part of any task: <a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/TASKS.md">the operator's manual</a> is about that.</p></details>
  </div>
</section>

<section class="end">
  <div>
    <h2>Run your own bench.</h2>
    <p>Node 20, a Solari key, and one model key. The demo runs the whole pipeline on a scripted provider in forty seconds with no VM and no API spend.</p>
    <div class="cta"><a class="btn primary" href="https://github.com/tohirr/solari-cookbook/tree/main/passk#setup">Setup guide</a><a class="btn" href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/TASKS.md">Write a task</a></div>
  </div>
  <pre class="code">git clone https://github.com/tohirr/solari-cookbook.git
cd solari-cookbook/passk && npm install
cp .env.example .env         <i># SOLARI_API_KEY + one model key</i>
sh demo.sh                   <i># the pipeline, no spend</i>
npm run passk doctor         <i># keys, a desktop, one token</i>
npm run passk run tasks/notes.yaml -- --k 5</pre>
</section>

<div class="foot">
  <div>passk is built on <a href="https://getsolari.com">Solari</a> desktops, for the Solari challenge, by <a href="https://github.com/tohirr">Tohir</a>. The method follows Pinetree's <i>On the Reliability of Computer Use Agents</i> (2026).</div>
  <div><a href="https://github.com/tohirr/solari-cookbook/tree/main/passk">Source</a> · <a href="evidence/">Evidence</a> · <a href="studio/">Studio</a> · <a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/METHOD.md">Method</a></div>
</div>
${TIP_JS}
</div></main></body></html>`;
fs.writeFileSync(path.resolve("index.html"), html);
console.log(`landing: index.html (${(html.length / 1024).toFixed(0)} KB)`);
