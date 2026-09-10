/**
 * Comparison page: two conditions from the same snapshot, side by side. This
 * is the page the whole tool exists to produce. It leads with what changed,
 * shows every run of each condition as a dot, puts both effort distributions
 * on one axis, and closes with one screenshot per side so the reader can see
 * the difference, not just count it.
 */
import path from "node:path";
import type { Comparison } from "../compare.js";
import type { BenchResult } from "../types.js";
import { percentile } from "../metrics.js";
import { CSS, TIP_JS, dotsHtml, esc, pct, secs, stripHtml, tailStat, usd, wordDiffHtml } from "./theme.js";

const runDir = (i: number) => `run-${String(i).padStart(2, "0")}`;

/** Frames that represent a side: the final frame of its shortest passing run, plus its first failure if it had one. */
function representative(b: BenchResult): { run: number; file: string; label: string; status: string }[] {
  const passing = b.runs.filter((r) => r.status === "passed").sort((x, y) => x.steps.length - y.steps.length)[0];
  const failing = b.runs.find((r) => r.status === "failed");
  return [passing, failing].filter((r): r is NonNullable<typeof r> => !!r?.finalScreenshot)
    .map((r) => ({ run: r.runIndex, file: r.finalScreenshot!, label: `${r.status} in ${r.steps.length} steps`, status: r.status }));
}

function delta(v: number, goodWhen: "up" | "down", fmt: (x: number) => string): string {
  if (v === 0) return `<span class="delta flat">±0</span>`;
  const good = goodWhen === "up" ? v > 0 : v < 0;
  return `<span class="delta ${good ? "up" : "down"}">${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}</span>`;
}

export function renderCompare(c: Comparison, A: BenchResult, B: BenchResult, outDir: string): string {
  const m = A.metrics, n = B.metrics;
  const rel = (dir: string) => path.relative(outDir, dir);
  const att = (b: BenchResult) => b.runs.filter((r) => !(r.status === "errored" && r.steps.length === 0));
  const stepMax = Math.max(...att(A).map((r) => r.steps.length), ...att(B).map((r) => r.steps.length), 1);
  const secMax = Math.ceil(Math.max(...att(A).map((r) => r.durationMs), ...att(B).map((r) => r.durationMs), 1000) / 1000);
  const repA = representative(A), repB = representative(B);
  const frame = (dir: string, cls: "a" | "b", f: { run: number; file: string; label: string; status: string }) =>
    `<div class="card" style="padding:10px"><div style="margin-bottom:8px"><span class="pill ${cls}">${cls.toUpperCase()}</span> run ${f.run} · <span class="pill ${f.status}">${esc(f.label)}</span></div><a href="${rel(dir)}/${runDir(f.run)}/${f.file}" target="_blank"><img src="${rel(dir)}/${runDir(f.run)}/${f.file}" style="width:100%;border-radius:8px;border:1px solid var(--line)" alt="${cls} final screenshot"></a></div>`;
  const changedLabel = c.changed.length === 1 ? c.changed[0] : c.changed.join(" and ");

  const headline = (() => {
    const dp = n.passed - m.passed;
    const ds = n.medianSteps - m.medianSteps;
    const parts: string[] = [];
    if (dp !== 0) parts.push(`passes went from <b>${m.passed}/${m.n}</b> to <b>${n.passed}/${n.n}</b>`);
    else parts.push(`both conditions passed <b>${m.passed}/${m.n}</b>`);
    if (ds !== 0) parts.push(`median effort ${ds < 0 ? "fell" : "rose"} from ${m.medianSteps} to ${n.medianSteps} steps`);
    if (m.costPerSuccessUsd !== null && n.costPerSuccessUsd !== null && m.costPerSuccessUsd > 0) {
      const r = n.costPerSuccessUsd / m.costPerSuccessUsd;
      if (Math.abs(r - 1) > 0.15) parts.push(`cost per success ${r < 1 ? "dropped" : "rose"} ${r < 1 ? `${Math.round((1 - r) * 100)}%` : `${Math.round((r - 1) * 100)}%`}`);
    }
    const sig = c.fisherP < 0.05 ? "The pass/fail split is unlikely to be noise" : `On ${m.n}-vs-${n.n} runs the pass/fail split alone is consistent with noise (p = ${c.fisherP.toFixed(2)})`;
    return `Changing only the <b>${esc(changedLabel)}</b>: ${parts.join("; ")}. ${sig}.`;
  })();

  // A tail statistic only if the smaller side can carry it; both sides get the same one so the row compares like with like.
  const tail = tailStat(Math.min(m.n, n.n));
  const stepsOf = (b: BenchResult) => b.runs.filter((r) => r.status !== "errored" || r.steps.length > 0).map((r) => r.steps.length).sort((x, y) => x - y);
  const tailA = tail ? Math.round(percentile(stepsOf(A), tail.p)) : null, tailB = tail ? Math.round(percentile(stepsOf(B), tail.p)) : null;
  const tailText = (b: BenchResult, v: number | null) => (tail && v !== null ? `${tail.label} ${v}` : `range ${b.metrics.minSteps}–${b.metrics.maxSteps}`);

  const side = (label: "A" | "B", b: BenchResult, cls: "a" | "b", dir: string, tailV: number | null) => `
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="pill ${cls}">${label}</span><b>${esc(b.taskName)}</b><a href="${rel(dir)}/report.html" style="margin-left:auto;color:var(--ink-3);font-size:12px;white-space:nowrap">full report</a></div>
      ${dotsHtml(b.runs.map((r) => ({ status: r.status, runIndex: r.runIndex, steps: r.steps.length, errorKind: r.errorKind, stoppedBy: r.stoppedBy })), b.metrics.skipped, "", (i) => `${rel(dir)}/report.html#run-${i}`)}
      <div class="kpis" style="margin-top:14px;grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><b>${b.metrics.passed}/${b.metrics.n}</b><span>passed · ${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)}</span></div>
        <div class="kpi"><b>${b.metrics.medianSteps}</b><span>median steps · ${tailText(b, tailV)}</span></div>
        <div class="kpi"><b>${usd(b.metrics.costPerSuccessUsd)}</b><span>per success</span></div>
      </div>
    </div>`;

  // The prompt once, not twice: as a word diff when it is what changed, so the reader sees the one edit rather than re-reading two paragraphs.
  const promptBlock = c.changed.includes("prompt")
    ? `<div class="diff"><div style="color:var(--ink-3);font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">prompt · <del>A</del> → <ins>B</ins></div>${wordDiffHtml(A.prompt, B.prompt)}</div>`
    : `<blockquote class="prompt">${esc(A.prompt.trim())}</blockquote>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · ${esc(A.taskName)} vs ${esc(B.taskName)}</title><style>${CSS}</style></head><body><main>
<div class="brand"><b>passk</b> controlled comparison · outcomes verified inside the VM</div>
<h1>${esc(changedLabel.charAt(0).toUpperCase() + changedLabel.slice(1))} changed. Did reliability?</h1>
<div class="meta">held fixed: ${c.heldFixed.map((h) => `<code>${esc(h)}</code>`).join(" ")} · changed: ${c.changed.map((h) => `<code>${esc(h)}</code>`).join(" ") || "nothing"} · <code>${esc(A.model)}</code></div>
<p class="verdict">${headline}</p>
${c.warnings.map((w) => `<div class="note" style="color:var(--warn)">⚠ ${esc(w)}</div>`).join("")}

${promptBlock}
<div class="two">${side("A", A, "a", c.a.dir, tailA)}${side("B", B, "b", c.b.dir, tailB)}</div>

<h2>Effort on one axis</h2>
<div class="card">
  <div style="color:var(--ink-3);font-size:12px">steps · <span class="pill a">A</span> <span class="pill b">B</span></div>
  ${stripHtml([...att(A).map((r) => ({ v: r.steps.length, cls: `a${r.status === "passed" ? "" : " hollow"}`, tip: `A run ${r.runIndex}: ${r.steps.length} steps, ${r.status}` })), ...att(B).map((r) => ({ v: r.steps.length, cls: `b${r.status === "passed" ? "" : " hollow"}`, tip: `B run ${r.runIndex}: ${r.steps.length} steps, ${r.status}` }))], { a: m.medianSteps, b: n.medianSteps }, 0, stepMax, "")}
  <div style="color:var(--ink-3);font-size:12px;margin-top:16px">seconds</div>
  ${stripHtml([...att(A).map((r) => ({ v: Math.round(r.durationMs / 1000), cls: `a${r.status === "passed" ? "" : " hollow"}`, tip: `A run ${r.runIndex}: ${secs(r.durationMs)}, ${r.status}` })), ...att(B).map((r) => ({ v: Math.round(r.durationMs / 1000), cls: `b${r.status === "passed" ? "" : " hollow"}`, tip: `B run ${r.runIndex}: ${secs(r.durationMs)}, ${r.status}` }))], { a: Math.round(m.medianDurationMs / 1000), b: Math.round(n.medianDurationMs / 1000) }, 0, secMax, "s")}
  <div class="note">Filled points passed, hollow points failed. Markers are each condition's median. Hover a point for the run.</div>
</div>

<h2>Side by side</h2>
<div class="card" style="padding:0;overflow-x:auto"><table>
<tr><th></th><th class="num">A</th><th class="num">B</th><th class="num">Δ B − A</th></tr>
<tr><td>passed</td><td class="num">${m.passed}/${m.n}</td><td class="num">${n.passed}/${n.n}</td><td class="num">${delta(n.passed - m.passed, "up", (x) => String(x))}</td></tr>
<tr><td>pass rate (95% interval)</td><td class="num">${pct(m.passAt1)} (${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)})</td><td class="num">${pct(n.passAt1)} (${pct(n.passAt1Lower)}–${pct(n.passAt1Upper)})</td><td class="num">${delta(Math.round(c.delta.passAt1 * 100), "up", (x) => `${x} pts`)}</td></tr>
<tr><td>pass^${c.powK} estimated</td><td class="num">${pct(m.passPowK[c.powK] ?? 0)}</td><td class="num">${pct(n.passPowK[c.powK] ?? 0)}</td><td class="num">${delta(Math.round(c.delta.passPowK * 100), "up", (x) => `${x} pts`)}</td></tr>
<tr><td>median steps</td><td class="num">${m.medianSteps}</td><td class="num">${n.medianSteps}</td><td class="num">${delta(c.delta.medianSteps, "down", (x) => String(x))}</td></tr>
${tail && tailA !== null && tailB !== null
  ? `<tr><td>${tail.label} steps</td><td class="num">${tailA}</td><td class="num">${tailB}</td><td class="num">${delta(tailB - tailA, "down", (x) => String(x))}</td></tr>`
  : `<tr><td>step range</td><td class="num">${m.minSteps}–${m.maxSteps}</td><td class="num">${n.minSteps}–${n.maxSteps}</td><td class="num"><span class="delta flat">too few runs for a percentile</span></td></tr>`}
<tr><td>median duration</td><td class="num">${secs(m.medianDurationMs)}</td><td class="num">${secs(n.medianDurationMs)}</td><td class="num">${delta(Math.round(c.delta.medianDurationMs / 1000), "down", (x) => `${x}s`)}</td></tr>
<tr><td>cost per success</td><td class="num">${usd(m.costPerSuccessUsd)}</td><td class="num">${usd(n.costPerSuccessUsd)}</td><td class="num">${c.delta.costPerSuccessUsd === null ? "" : delta(Math.round(c.delta.costPerSuccessUsd * 1000) / 1000, "down", (x) => `$${x.toFixed(3)}`)}</td></tr>
<tr><td>Fisher exact p (pass/fail)</td><td class="num" colspan="3" style="text-align:left">${c.fisherP.toFixed(3)} — ${c.fisherP < 0.05 ? "unlikely to be noise" : "consistent with noise at this sample size; effort and cost may still be informative"}</td></tr>
</table></div>

${c.checks ? `<h2>By check</h2>
<div class="card" style="padding:0;overflow-x:auto"><table>
<tr><th>check</th><th class="num">A</th><th class="num">B</th><th class="num">Δ B − A</th></tr>
${c.checks.map((x) => `<tr><td>${esc(x.label)}${x.invariant ? ` <span class="pill inv">guard</span>` : ""}</td><td class="num">${x.a.passed}/${x.a.n}</td><td class="num">${x.b.passed}/${x.b.n}</td><td class="num">${delta(Math.round(x.delta * 100), "up", (v) => `${v} pts`)}</td></tr>`).join("\n")}
</table></div>
<div class="note" style="margin-top:8px">Same checks on both sides, so each row is one rule under two conditions: what the change fixed, and what it did not touch.</div>` : ""}

${repA.length || repB.length ? `<h2>What the desktop looked like when each side stopped</h2>
<div class="two">
  <div style="display:grid;gap:12px">${repA.map((f) => frame(c.a.dir, "a", f)).join("")}</div>
  <div style="display:grid;gap:12px">${repB.map((f) => frame(c.b.dir, "b", f)).join("")}</div>
</div>` : ""}

<div class="foot">
  <div>${c.heldFixed.includes("snapshot") ? "Both conditions forked the same snapshot" : "The two conditions forked different snapshots, so the environment is what changed"}${c.heldFixed.includes("checks") ? " and were graded by identical checks inside the VM" : "; note that the checks differ, so grading is not identical"}. Full reports: <a href="${rel(c.a.dir)}/report.html">A</a> · <a href="${rel(c.b.dir)}/report.html">B</a>.</div>
  <div style="margin-top:6px">passk ${esc(A.provenance?.passkVersion ?? "")}${A.provenance?.gitCommit ? ` @ ${esc(A.provenance.gitCommit)}` : ""} · task hashes ${esc(c.a.taskHash ?? "?")} → ${esc(c.b.taskHash ?? "?")}</div>
</div>
<script type="application/json" id="comparison">${JSON.stringify(c).replace(/</g, "\\u003c")}</script>
${TIP_JS}
</main></body></html>`;
}
