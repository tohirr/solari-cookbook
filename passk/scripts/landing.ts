/**
 * Generate passk/index.html: the front page, which is the leaderboard.
 * One question, the shape of your task, and a board of models with their
 * pass rate, interval, pass^5 and cost, every row read from the exported
 * benches. Models without evidence get an honest "not yet run" row with
 * the command and a spend estimate from the shape's last bench. The page
 * cannot claim anything the evidence does not; everything deeper is a link
 * in the fine print.
 *
 *   npx tsx scripts/landing.ts        # from passk/
 */
import fs from "node:fs";
import path from "node:path";
import { usd } from "../src/report/theme.js";
import { PRICES, wilson } from "../src/metrics.js";
import type { BenchResult } from "../src/types.js";

const EV = path.resolve("evidence");
const benches = fs.readdirSync(EV).filter((d) => fs.existsSync(path.join(EV, d, "bench.json")))
  .map((d) => ({ dir: d, b: JSON.parse(fs.readFileSync(path.join(EV, d, "bench.json"), "utf8")) as BenchResult }));

/** The shapes on the board: which tasks belong to each, how each condition is named, and the words that map a use case to it. */
const SHAPES: { id: string; name: string; blurb: string; keywords: string[]; tasks: Record<string, string> }[] = [
  { id: "ticket-triage", name: "Ticket triage · web app", blurb: "Find rows in an internal tool, change dropdowns, save each one. One closed ticket must not be touched.",
    keywords: ["ticket", "support", "queue", "crm", "dashboard", "assign", "web app", "webapp", "internal tool", "dropdown", "priority", "helpdesk", "zendesk", "jira", "rows", "saas", "portal", "admin"],
    tasks: { "ticket-queue": "baseline prompt", "ticket-queue-verify": "prompt adds “screenshot and confirm”", "ticket-queue-reload": "prompt adds “reload and confirm”" } },
  { id: "invoice-entry", name: "Invoice entry · PDF to form", blurb: "Read the right PDF of three, skip the one already entered, fill a form, attach the file, save as Pending review. Never approve or pay.",
    keywords: ["invoice", "pdf", "accounts payable", "payable", "erp", "ledger", "data entry", "upload", "attach", "form", "vendor", "receipt", "expense", "bill", "quickbooks", "xero", "netsuite", "sap"],
    tasks: { "invoice-entry": "baseline prompt" } },
  { id: "spreadsheet", name: "Spreadsheet edit · Calc", blurb: "Open a sheet, add a total row with a formula, save as CSV through the keep-format dialog.",
    keywords: ["spreadsheet", "excel", "calc", "csv", "formula", "total", "sum", "sheet", "cells", "column", "report", "numbers", "libreoffice", "google sheets"],
    tasks: { "q3-total": "baseline prompt" } },
  { id: "files", name: "File operations · desktop", blurb: "Archive the oldest invoices in a folder with the file manager. Which ones count as oldest is the ambiguity.",
    keywords: ["file", "files", "rename", "folder", "archive", "move", "finder", "explorer", "organise", "organize", "sort", "directory", "downloads", "desktop"],
    tasks: { "rename-invoices": "ambiguous prompt", "rename-invoices-clarified": "clarified prompt" } },
  { id: "notes", name: "Save a note · dialogs", blurb: "Type a note in a text editor and save it to a named path through the save dialog.",
    keywords: ["note", "notes", "text editor", "editor", "save dialog", "dialog", "write", "document", "type", "notepad", "memo", "draft"],
    tasks: { "notes-nodir": "Documents folder missing", "notes": "Documents folder present" } },
];

/** Models offered for a run when no evidence exists yet. */
const CANDIDATES = ["claude-sonnet-5", "claude-opus-5", "gpt-5.6"];

const pow = (m: BenchResult["metrics"], k: number) => (m.passPowK as unknown as Record<string, number>)[String(Math.min(k, m.n))] ?? 0;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

interface Row {
  model: string; condition: string; verified: boolean; passed?: number; n?: number; lower?: number; upper?: number; pow5?: number;
  steps?: number; perSuccess?: number | null; date?: string; href?: string; failures?: string; estimate?: number; cmd?: string; k?: number; task?: string;
}
interface Shape { id: string; name: string; blurb: string; keywords: string[]; k: number; proves: number; rows: Row[]; runs: number; spend: number }

const shapes: Shape[] = SHAPES.map((s) => {
  const mine = benches.filter((x) => s.tasks[x.b.taskId]).sort((p, q) => q.b.metrics.n - p.b.metrics.n || p.b.startedAt.localeCompare(q.b.startedAt));
  const latest = mine.slice().sort((p, q) => q.b.startedAt.localeCompare(p.b.startedAt))[0];
  const k = latest ? latest.b.k : 10;
  const rows: Row[] = mine.map(({ dir, b }) => {
    const m = b.metrics;
    const causes = new Map<string, number>();
    for (const f of b.failures) causes.set(f.cause, (causes.get(f.cause) ?? 0) + 1);
    const fails = m.n - m.passed;
    const failures = fails === 0 ? (m.errored ? `none · ${m.errored} lost to infrastructure` : "none")
      : `${fails} · ${[...causes.entries()].map(([c, n]) => `${causes.size > 1 ? `${n} ` : ""}${c.replace(/_/g, " ")}`).join(", ")}`;
    return { model: b.model, condition: s.tasks[b.taskId], verified: true, passed: m.passed, n: m.n, lower: m.passAt1Lower, upper: m.passAt1Upper, pow5: pow(m, 5),
      steps: m.medianSteps, perSuccess: m.costPerSuccessUsd, date: day(b.finishedAt ?? b.startedAt), href: `evidence/${dir}/report.html`, failures, k: b.k };
  });
  // A spend estimate for a model with no evidence: this shape's tokens per run at that model's price, times k.
  const ref = latest?.b;
  const attempted = ref ? ref.runs.filter((r) => r.steps.length > 0) : [];
  const tokIn = attempted.length ? attempted.reduce((a, r) => a + r.usage.inputTokens, 0) / attempted.length : 0;
  const tokOut = attempted.length ? attempted.reduce((a, r) => a + r.usage.outputTokens, 0) / attempted.length : 0;
  const have = new Set(rows.map((r) => r.model));
  const task = ref ? ref.taskId : Object.keys(s.tasks)[0];
  for (const model of CANDIDATES) {
    if (have.has(model)) continue;
    const price = PRICES[model];
    const estimate = price && ref ? ((tokIn * price.in + tokOut * price.out) / 1e6) * k : undefined;
    rows.push({ model, condition: "baseline prompt", verified: false, estimate, k, task, cmd: `PASSK_MODEL=${model} npm run passk run tasks/${task}.yaml -- --k ${k} --budget ${estimate ? Math.ceil(estimate * 2 * 4) / 4 : 1}` });
  }
  return { id: s.id, name: s.name, blurb: s.blurb, keywords: s.keywords, k, proves: wilson(k, k).lower, rows,
    runs: mine.reduce((a, x) => a + x.b.runs.length, 0), spend: mine.reduce((a, x) => a + x.b.metrics.totalCostUsd, 0) };
});

const totalRuns = benches.reduce((a, x) => a + x.b.runs.length, 0);
const totalSpend = benches.reduce((a, x) => a + x.b.metrics.totalCostUsd, 0);
const modelsWithEvidence = new Set(benches.map((x) => x.b.model)).size;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk · which model can actually do your computer task, reliably?</title>
<meta name="description" content="A leaderboard of computer-use agents by task shape: every row is k forks of one desktop snapshot, graded inside the VM. Pass rate with its interval, pass^5, steps and cost per success.">
<meta property="og:title" content="passk · which model can actually do your computer task, reliably?">
<meta property="og:description" content="${totalRuns} verified runs across ${shapes.length} task shapes. Pick yours, compare models on the chance it works every time.">
<meta property="og:image" content="https://tohirr.github.io/solari-cookbook/passk/docs/compare-ticket-queue.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%2322c55e'/%3E%3Cpath d='M9 16l5 5 9-10' stroke='%230e0f12' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0e0f12;--surface:#15171c;--surface-2:#1b1e25;--line:#262a33;--line-2:#333845;--ink:#eceef2;--ink-2:#a3a9b7;--ink-3:#6b7180;--good:#22c55e;--good-dim:rgba(34,197,94,.22);--crit:#e5484d;--warn:#f5a524;--accent:#f5c518;--accent-ink:#141306;
--sans:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--ink-2)}a:hover{color:var(--ink)}
code{font:12.5px var(--mono);color:var(--ink-2)}
.bar{border-bottom:1px solid var(--line)}
.bar .in{max-width:1120px;margin:0 auto;padding:0 28px;height:58px;display:flex;align-items:center;gap:14px}
.logo{font-weight:700;font-size:15px;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:9px}
.logo i{width:12px;height:12px;border-radius:50%;background:var(--good);display:inline-block}
.bar .right{margin-left:auto;display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);background:transparent;padding:7px 12px;border-radius:10px;cursor:pointer;font-family:var(--sans);line-height:1;white-space:nowrap}
.btn:hover{background:var(--surface-2);color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.06);color:var(--accent-ink)}
main{max-width:1120px;margin:0 auto;padding:64px 28px 60px}
h1{font-size:46px;line-height:1.05;letter-spacing:-.035em;font-weight:600;margin:0 0 14px;max-width:820px}
@media(max-width:560px){h1{font-size:34px}}
.sub{font-size:17px;color:var(--ink-2);max-width:640px;margin:0 0 34px}
.sub b{color:var(--ink);font-weight:600}
.ask{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:6px 6px 6px 16px;margin-bottom:14px}
.ask svg{flex:none}
.ask input{flex:1;min-width:0;background:transparent;border:0;color:var(--ink);font:15px var(--sans);padding:10px 0;outline:none}
.ask input::placeholder{color:var(--ink-3)}
.ask .match{font-size:12.5px;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line-2);border-radius:999px;padding:4px 10px;white-space:nowrap}
.ask .match b{color:var(--ink);font-weight:600}
@media(max-width:640px){.ask{flex-wrap:wrap}.ask .match{width:100%;text-align:center}}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px}
.chip{font-size:13px;font-weight:500;color:var(--ink-2);border:1px solid var(--line-2);background:transparent;padding:8px 14px;border-radius:999px;cursor:pointer;font-family:var(--sans)}
.chip:hover{color:var(--ink);background:var(--surface-2)}
.chip.on{color:var(--accent-ink);background:var(--accent);border-color:var(--accent);font-weight:600}
.chip.more{color:var(--ink-3);border-style:dashed;text-decoration:none}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.head .blurb{font-size:13.5px;color:var(--ink-3);max-width:560px}
.head .k{font-size:13px;color:var(--ink-2);white-space:nowrap}
.head .k code{color:var(--ink);background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;padding:3px 9px}
.board{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;min-width:900px}
th{text-align:left;color:var(--ink-3);font-weight:500;font-size:12px;padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:13px 14px;border-top:1px solid var(--line);font-size:13.5px;vertical-align:middle}
tr:first-child td{border-top:0}
th.num,td.num{text-align:right;font-family:var(--mono);font-size:12.5px}
td.dim{color:var(--ink-3)}
.model{min-width:180px}.model b{font-weight:600;display:block;white-space:nowrap}.model span{font-size:12px;color:var(--ink-3)}
.rate{display:flex;align-items:center;gap:10px;min-width:230px}
.rate .track{position:relative;flex:1;height:8px;background:var(--surface-2);border-radius:4px}
.rate .band{position:absolute;top:0;bottom:0;background:rgba(34,197,94,.28);border-radius:4px}
.rate .pt{position:absolute;top:-3px;width:14px;height:14px;border-radius:50%;background:var(--good);transform:translateX(-50%)}
.rate .v{font:12.5px var(--mono);color:var(--ink);width:118px;text-align:right;white-space:nowrap}
.rate .v span{color:var(--ink-3)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.pill.ok{background:var(--good-dim);color:var(--good)}.pill.no{background:var(--surface-2);color:var(--ink-2)}
.fails{font-size:12.5px;color:var(--ink-2);min-width:150px;max-width:200px}
.cmd{display:none;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:12px/1.6 var(--mono);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}
tr.open .cmd{display:block}
.note{font-size:12.5px;color:var(--ink-3);margin-top:10px}
.fine{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3);display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
.fine a{color:var(--ink-2)}
</style></head><body>
<div class="bar"><div class="in">
  <a class="logo" href="./"><i></i>passk</a>
  <div class="right"><a class="btn" href="https://github.com/tohirr/solari-cookbook/tree/main/passk">GitHub</a><a class="btn primary" href="https://github.com/tohirr/solari-cookbook/tree/main/passk#setup">Run your own task</a></div>
</div></div>
<main>
  <h1>Which model can actually do your computer task, reliably?</h1>
  <p class="sub">Pick the shape of your task. Every row is <b>k forks of one desktop snapshot</b>, same prompt, and every outcome is graded <b>inside the VM</b>, never by what the agent says. Browsing is free. Running is one command.</p>

  <form class="ask" id="ask" onsubmit="return false">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7180" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
    <input id="q" type="text" placeholder="Describe your task, e.g. enter invoices from PDFs into our accounts-payable tool" autocomplete="off">
    <span class="match" id="match">closest shape: <b>—</b></span>
  </form>
  <div class="chips" id="chips"></div>

  <div class="head"><div><h2 id="sname"></h2><div class="blurb" id="sblurb"></div></div><div class="k" id="sk"></div></div>
  <div class="board"><table>
    <thead><tr><th>Model</th><th>passed · pass@1 · 95% interval</th><th class="num">pass^5</th><th class="num">$ / success</th><th>failures</th><th>status</th><th></th></tr></thead>
    <tbody id="rows"></tbody>
  </table></div>
  <div class="note">The bar is the 95% Wilson interval on the pass rate, the dot the observed rate. pass^5 is the chance five attempts in a row all pass. A run estimate is this shape's tokens per run at that model's list price, times k; Solari desktop time is on your plan.</div>

  <div class="fine">
    <div>${totalRuns} verified runs · ${shapes.length} task shapes · ${modelsWithEvidence} model${modelsWithEvidence === 1 ? "" : "s"} with evidence · ${usd(totalSpend, 2)} of model spend in total. Every number on this page is read from <a href="evidence/">the published bench files</a>.</div>
    <div><a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/METHOD.md">How it is measured</a> · <a href="evidence/index.html">Evidence and findings</a> · <a href="studio/">Studio</a> · <a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/TASKS.md">Write a task</a> · built on <a href="https://getsolari.com">Solari</a></div>
  </div>
</main>
<script>
const SHAPES = ${JSON.stringify(shapes)};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x) => Math.round(x * 100) + "%";
const usd = (x, d = 3) => x === null || x === undefined ? "—" : "$" + x.toFixed(d);
let current = SHAPES[0].id;
function chips() {
  document.getElementById("chips").innerHTML = SHAPES.map((s) => \`<button type="button" class="chip\${s.id === current ? " on" : ""}" data-id="\${s.id}">\${esc(s.name)}</button>\`).join("")
    + \`<a class="chip more" href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/TASKS.md">+ propose a shape</a>\`;
}
function row(r) {
  if (!r.verified) return \`<tr class="unrun"><td class="model"><b>\${esc(r.model)}</b><span>\${esc(r.condition)}</span></td>
    <td><div class="rate"><div class="track"></div><div class="v" style="color:var(--ink-3)">—</div></div></td>
    <td class="num dim">—</td><td class="num dim">—</td><td class="fails" style="color:var(--ink-3)">—</td>
    <td><span class="pill no">not yet run</span></td>
    <td><button type="button" class="btn primary run">Run · \${r.estimate !== undefined ? "est. " + usd(r.estimate, 2) : "your keys"}</button><div class="cmd">\${esc(r.cmd)}\\n<span style="color:var(--ink-3)"># from passk/ with SOLARI_API_KEY and the model's key in .env · the report lands in runs/</span></div></td></tr>\`;
  const lo = r.lower * 100, hi = r.upper * 100, p = (r.passed / r.n) * 100;
  return \`<tr><td class="model"><b>\${esc(r.model)}</b><span>\${esc(r.condition)}</span></td>
    <td><div class="rate"><div class="track"><div class="band" style="left:\${lo}%;width:\${hi - lo}%"></div><div class="pt" style="left:\${p}%"></div></div><div class="v">\${r.passed}/\${r.n} <span>\${pct(r.lower)}–\${pct(r.upper)}</span></div></div></td>
    <td class="num">\${pct(r.pow5)}</td><td class="num">\${usd(r.perSuccess)}</td>
    <td class="fails">\${esc(r.failures)}</td>
    <td><span class="pill ok" title="\${esc(r.date)}">verified</span></td>
    <td><a class="btn" href="\${esc(r.href)}">Open</a></td></tr>\`;
}
function render() {
  const s = SHAPES.find((x) => x.id === current);
  document.getElementById("sname").textContent = s.name;
  document.getElementById("sblurb").textContent = s.blurb;
  document.getElementById("sk").innerHTML = \`k = <code>\${s.k}</code> · \${s.k} passes prove at least \${pct(s.proves)}\`;
  document.getElementById("rows").innerHTML = s.rows.map(row).join("");
  chips();
}
function match(text) {
  const t = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const s of SHAPES) {
    const score = s.keywords.reduce((n, k) => n + (t.includes(k) ? (k.length > 5 ? 2 : 1) : 0), 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  const m = document.getElementById("match");
  if (!t.trim()) { m.innerHTML = "closest shape: <b>—</b>"; return; }
  if (!best) { m.innerHTML = "no close shape yet · <b>propose one</b>"; return; }
  m.innerHTML = \`closest shape: <b>\${esc(best.name)}</b>\`;
  if (best.id !== current) { current = best.id; render(); }
}
document.getElementById("chips").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (!b) return; current = b.dataset.id; render(); });
document.getElementById("rows").addEventListener("click", (e) => { const b = e.target.closest("button.run"); if (!b) return; b.closest("tr").classList.toggle("open"); });
document.getElementById("q").addEventListener("input", (e) => match(e.target.value));
const q0 = new URLSearchParams(location.search).get("shape"); if (q0 && SHAPES.some((s) => s.id === q0)) current = q0;
render();
</script>
</body></html>`;
fs.writeFileSync(path.resolve("index.html"), html);
console.log(`landing: index.html (${(html.length / 1024).toFixed(0)} KB), ${shapes.length} shapes, ${shapes.reduce((a, s) => a + s.rows.length, 0)} rows`);
