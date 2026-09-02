/**
 * Static HTML report for one bench. Self-contained: data is embedded, no
 * network. Screenshots are referenced relatively so the folder is portable.
 *
 * This is the scaffold renderer — the design pass comes later.
 */
import type { BenchResult } from "../types.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function renderReport(b: BenchResult): string {
  const m = b.metrics;
  const ks = Object.keys(m.passPowK).map(Number);
  const runDir = (i: number) => `run-${String(i).padStart(2, "0")}`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · ${esc(b.taskName)}</title>
<style>
  :root{--bg:#0b0c0f;--fg:#e8e8ec;--mut:#8a8f9c;--ok:#39d98a;--bad:#ff5c5c;--card:#15171c;--line:#23262e}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{max-width:1100px;margin:0 auto;padding:40px 24px}
  h1{font-size:28px;margin:0 0 4px}.sub{color:var(--mut);margin-bottom:28px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:28px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
  .stat b{display:block;font-size:26px;font-weight:600}.stat span{color:var(--mut);font-size:12px}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;border-top:1px solid var(--line);vertical-align:top}th{color:var(--mut);font-weight:500;border-top:0}
  .ok{color:var(--ok)}.bad{color:var(--bad)}
  .bars{display:flex;gap:6px;align-items:flex-end;height:80px;margin:8px 0 24px}
  .bar{flex:1;height:100%;background:#2a2e3a;border-radius:4px 4px 0 0;position:relative}.bar i{position:absolute;bottom:0;left:0;right:0;background:var(--ok);border-radius:4px 4px 0 0}
  .bar small{position:absolute;top:-18px;left:0;right:0;text-align:center;color:var(--mut);font-size:11px}
  .shots{display:flex;gap:6px;overflow-x:auto;padding:6px 0}.shots img{height:90px;border-radius:6px;border:1px solid var(--line)}
  details{margin-top:6px}summary{cursor:pointer;color:var(--mut)}
  pre{white-space:pre-wrap;font-size:12px;color:var(--mut)}
  .cause{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#2a2e3a}
</style></head><body><main>
<h1>${esc(b.taskName)}</h1>
<div class="sub">${esc(b.model)} · k=${b.k} · snapshot ${esc(b.snapshotId)} · ${esc(b.startedAt)}${m.errored ? ` · <span class="bad">${m.errored} run${m.errored > 1 ? "s" : ""} lost to infrastructure, not scored</span>` : ""}</div>
<blockquote style="color:var(--mut);border-left:3px solid var(--line);margin:0 0 24px;padding:4px 12px">${esc(b.prompt)}</blockquote>

<div class="grid">
  <div class="stat"><b>${pct(m.passAt1)}</b><span>pass@1 · ${m.passed}/${m.n} runs</span></div>
  <div class="stat"><b>${pct(m.passPowK[Math.min(5, m.n)] ?? 0)}</b><span>pass^${Math.min(5, m.n)} · all ${Math.min(5, m.n)} in a row</span></div>
  <div class="stat"><b>${m.meanSteps.toFixed(1)}</b><span>mean steps · range ${m.minSteps}–${m.maxSteps}</span></div>
  <div class="stat"><b>${(m.meanDurationMs / 1000).toFixed(0)}s</b><span>mean duration</span></div>
</div>

<h3>pass^k — probability every one of k runs passes</h3>
<div class="bars">${ks.map((k) => `<div class="bar" title="pass^${k} = ${pct(m.passPowK[k])}"><small>k=${k}</small><i style="height:${Math.round(m.passPowK[k] * 100)}%"></i></div>`).join("")}</div>

<h3>Runs</h3>
<div style="overflow-x:auto"><table><tr><th>#</th><th>Result</th><th>Steps</th><th>Time</th><th>Checks</th><th>Cause</th></tr>
${b.runs.map((r) => {
  const f = b.failures.find((x) => x.runIndex === r.runIndex);
  return `<tr><td>${r.runIndex}</td><td class="${r.status === "passed" ? "ok" : "bad"}">${r.status}</td><td>${r.steps.length}</td><td>${(r.durationMs / 1000).toFixed(0)}s</td>
  <td>${r.checks.map((c) => `<div class="${c.passed ? "ok" : "bad"}">${c.passed ? "✓" : "✗"} ${esc(c.check.type)}${c.detail ? ` <span style="color:var(--mut)">— ${esc(c.detail)}</span>` : ""}</div>`).join("")}${r.error ? `<div class="bad">${esc(r.error)}</div>` : ""}</td>
  <td>${f ? `<span class="cause">${esc(f.cause)}</span>${f.divergenceStep !== null ? ` <span style="color:var(--mut)">@ step ${f.divergenceStep}</span>` : ""}<div style="color:var(--mut);font-size:12px;margin-top:4px">${esc(f.explanation)}</div>` : ""}</td></tr>
  <tr><td></td><td colspan="5"><div class="shots">${r.steps.filter((s) => s.screenshot).map((s) => `<a href="${runDir(r.runIndex)}/${s.screenshot}" target="_blank"><img loading="lazy" src="${runDir(r.runIndex)}/${s.screenshot}" title="step ${s.index}"></a>`).join("")}${r.finalScreenshot ? `<a href="${runDir(r.runIndex)}/${r.finalScreenshot}" target="_blank"><img loading="lazy" src="${runDir(r.runIndex)}/${r.finalScreenshot}" title="final" style="border-color:var(--ok)"></a>` : ""}</div>
  <details><summary>trace</summary><pre>${esc(r.steps.map((s) => `${s.index}. ${s.name} ${JSON.stringify(s.input)}${s.error ? "  !! " + s.error : ""}`).join("\n"))}\n\nfinal: ${esc(r.finalMessage)}</pre></details></td></tr>`;
}).join("")}
</table></div>
<script type="application/json" id="bench">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>
</main></body></html>`;
}
