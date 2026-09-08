/**
 * The leaderboard: one question, the shape of your task, and a board of
 * models with their pass rate, interval, pass^5 and cost. Every row is read
 * from a bench file, so the board cannot claim anything the evidence does
 * not. The same page renders in two modes: `static`, the published front
 * page built from evidence/, and `studio`, served locally by `passk studio`
 * with your own runs/ folded in, a key form, and a Run button that works.
 */
import fs from "node:fs";
import path from "node:path";
import { PRICES, wilson } from "../metrics.js";
import { esc, usd } from "./theme.js";
import type { BenchResult } from "../types.js";

/** The shapes on the board: which tasks belong to each, how each condition is named, and the words that map a use case to it. */
export const SHAPES: { id: string; name: string; blurb: string; keywords: string[]; tasks: Record<string, string> }[] = [
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
export const CANDIDATES = ["claude-sonnet-5", "claude-opus-5", "gpt-5.6"];

export interface BoardBench { dir: string; href: string; source: "evidence" | "local"; b: BenchResult }

/** Every bench under a folder: evidence/ (verified, published) or runs/ (local). */
export function loadBenches(root: string, source: BoardBench["source"], hrefPrefix: string): BoardBench[] {
  if (!fs.existsSync(root)) return [];
  const out: BoardBench[] = [];
  for (const d of fs.readdirSync(root).sort()) {
    const p = path.join(root, d, "bench.json");
    if (!fs.existsSync(p)) continue;
    try { out.push({ dir: d, href: `${hrefPrefix}${d}/report.html`, source, b: JSON.parse(fs.readFileSync(p, "utf8")) as BenchResult }); } catch { /* a half-written manifest; skip */ }
  }
  return out;
}

export interface Row {
  model: string; condition: string; task: string; state: "verified" | "local" | "running" | "unrun";
  passed?: number; n?: number; k?: number; lower?: number; upper?: number; pow5?: number; perSuccess?: number | null;
  spent?: number; date?: string; href?: string; failures?: string; estimate?: number;
}
export interface Shape {
  id: string; name: string; blurb: string; keywords: string[]; k: number; proves: number; rows: Row[];
  /** The task (condition) a fresh run defaults to, and every condition by task id. */
  task: string; conditions: Record<string, string>;
  /** Estimated model spend per run, by model, from this shape's last bench's tokens at list price. */
  perRun: Record<string, number>;
}

const pow = (m: BenchResult["metrics"], k: number) => (m.passPowK as unknown as Record<string, number>)[String(Math.min(k, m.n))] ?? 0;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function buildShapes(all: BoardBench[]): Shape[] {
  // A local bench that was exported into evidence/ is the same bench; show it once, as verified.
  const published = new Set(all.filter((x) => x.source === "evidence").map((x) => `${x.b.taskId}|${x.b.startedAt}`));
  const benches = all.filter((x) => x.source === "evidence" || !published.has(`${x.b.taskId}|${x.b.startedAt}`));
  return SHAPES.map((s) => {
    const mine = benches.filter((x) => s.tasks[x.b.taskId]).sort((p, q) => q.b.metrics.n - p.b.metrics.n || p.b.startedAt.localeCompare(q.b.startedAt));
    const latest = mine.slice().sort((p, q) => q.b.startedAt.localeCompare(p.b.startedAt))[0];
    const ref = latest?.b;
    const k = ref ? ref.k : 10;
    const rows: Row[] = mine.map(({ href, source, b }) => {
      const m = b.metrics;
      const causes = new Map<string, number>();
      for (const f of b.failures) causes.set(f.cause, (causes.get(f.cause) ?? 0) + 1);
      const fails = m.n - m.passed;
      const failures = fails === 0 ? (m.errored ? `none · ${m.errored} lost to infrastructure` : "none")
        : `${fails} · ${[...causes.entries()].map(([c, n]) => `${causes.size > 1 ? `${n} ` : ""}${c.replace(/_/g, " ")}`).join(", ") || "not yet classified"}`;
      const running = b.status === "running";
      return { model: b.model, condition: s.tasks[b.taskId], task: b.taskId, state: running ? "running" : source === "evidence" ? "verified" : "local",
        passed: m.passed, n: m.n, k: b.k, lower: m.passAt1Lower, upper: m.passAt1Upper, pow5: pow(m, 5), perSuccess: m.costPerSuccessUsd, spent: m.totalCostUsd,
        date: day(b.finishedAt ?? b.startedAt), href, failures };
    });
    // Spend per run for a model with no evidence: this shape's tokens per run at that model's list price.
    const attempted = ref ? ref.runs.filter((r) => r.steps.length > 0) : [];
    const tokIn = attempted.length ? attempted.reduce((a, r) => a + r.usage.inputTokens, 0) / attempted.length : 0;
    const tokOut = attempted.length ? attempted.reduce((a, r) => a + r.usage.outputTokens, 0) / attempted.length : 0;
    const perRun: Record<string, number> = {};
    for (const [model, price] of Object.entries(PRICES)) perRun[model] = ref ? (tokIn * price.in + tokOut * price.out) / 1e6 : 0;
    perRun.scripted = 0;
    const have = new Set(rows.map((r) => r.model));
    const task = Object.keys(s.tasks)[0];
    for (const model of CANDIDATES) {
      if (have.has(model)) continue;
      rows.push({ model, condition: s.tasks[task], task, state: "unrun", k, estimate: ref ? perRun[model] * k : undefined });
    }
    return { id: s.id, name: s.name, blurb: s.blurb, keywords: s.keywords, k, proves: wilson(k, k).lower, rows, task, conditions: s.tasks, perRun };
  });
}

export const providerFor = (model: string): "anthropic" | "openai" | "scripted" => model === "scripted" ? "scripted" : model.startsWith("claude") ? "anthropic" : "openai";

export interface BoardPage {
  mode: "static" | "studio";
  shapes: Shape[];
  totals: { runs: number; spend: number; models: number };
  /** Studio only: which keys are set (never their values). */
  keys?: Record<string, boolean>;
}

export function renderBoard(page: BoardPage): string {
  const { shapes, totals } = page;
  const studio = page.mode === "studio";
  const models = [...Object.keys(PRICES), "scripted"];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>passk${studio ? " studio" : ""} · which model can actually do your computer task, reliably?</title>
<meta name="description" content="A leaderboard of computer-use agents by task shape: every row is k forks of one desktop snapshot, graded inside the VM. Pass rate with its interval, pass^5 and cost per success.">
<meta property="og:title" content="passk · which model can actually do your computer task, reliably?">
<meta property="og:description" content="${totals.runs} verified runs across ${shapes.length} task shapes. Pick yours, compare models on the chance it works every time.">
<meta property="og:image" content="https://tohirr.github.io/solari-cookbook/passk/docs/compare-ticket-queue.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%2322c55e'/%3E%3Cpath d='M9 16l5 5 9-10' stroke='%230e0f12' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0e0f12;--surface:#15171c;--surface-2:#1b1e25;--line:#262a33;--line-2:#333845;--ink:#eceef2;--ink-2:#a3a9b7;--ink-3:#6b7180;--good:#22c55e;--good-dim:rgba(34,197,94,.22);--crit:#e5484d;--crit-dim:rgba(229,72,77,.22);--warn:#f5a524;--warn-dim:rgba(245,165,36,.18);--a:#3987e5;--a-dim:rgba(57,135,229,.22);--accent:#f5c518;--accent-ink:#141306;
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
.logo span{color:var(--ink-3);font-weight:500}
.bar .right{margin-left:auto;display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);background:transparent;padding:7px 12px;border-radius:10px;cursor:pointer;font-family:var(--sans);line-height:1;white-space:nowrap}
.btn:hover{background:var(--surface-2);color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.06);color:var(--accent-ink)}
.btn.danger{color:var(--crit);border-color:var(--crit-dim)}
.btn[disabled]{opacity:.45;cursor:not-allowed}
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
.rate .fill{position:absolute;top:0;bottom:0;left:0;background:var(--a-dim);border-radius:4px}
.rate .v{font:12.5px var(--mono);color:var(--ink);width:118px;text-align:right;white-space:nowrap}
.rate .v span{color:var(--ink-3)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.pill.ok{background:var(--good-dim);color:var(--good)}.pill.no{background:var(--surface-2);color:var(--ink-2)}.pill.local{background:var(--a-dim);color:var(--a)}.pill.live{background:var(--warn-dim);color:var(--warn)}
.fails{font-size:12.5px;color:var(--ink-2);min-width:150px;max-width:200px}
.cmd{display:none;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:12px/1.6 var(--mono);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}
tr.open .cmd{display:block}
.note{font-size:12.5px;color:var(--ink-3);margin-top:10px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.card h3{margin:0 0 4px;font-size:16px;font-weight:600;letter-spacing:-.01em}
.card .hint{font-size:13px;color:var(--ink-3);margin:0 0 14px}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
.field label{display:block;font-size:11.5px;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase;margin-bottom:5px}
.field input,.field select{width:100%;background:var(--surface-2);border:1px solid var(--line-2);color:var(--ink);border-radius:8px;padding:8px 10px;font:14px var(--sans)}
.field input::placeholder{color:var(--ink-3)}
.keys{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;align-items:end}
.keys .field label span{margin-left:8px;text-transform:none;letter-spacing:0}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}
.row .est{font-size:13px;color:var(--ink-2)}.row .est b{color:var(--ink)}
.msg{font-size:13px;margin-top:10px;color:var(--ink-2)}.msg.bad{color:var(--crit)}.msg.good{color:var(--good)}
.jobs{display:grid;gap:10px;margin-top:14px}
.job{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.job b{font-weight:600}.job .sub2{font-size:12.5px;color:var(--ink-2);margin-top:2px}
.job .log{font:11.5px/1.5 var(--mono);color:var(--ink-3);margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:60px;overflow:hidden}
.job .bar2{height:6px;background:var(--bg);border-radius:3px;margin-top:8px;overflow:hidden}.job .bar2 i{display:block;height:100%;background:var(--accent)}
.fine{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3);display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
.fine a{color:var(--ink-2)}
.check{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink-2)}
.check input{width:auto}
</style></head><body>
<div class="bar"><div class="in">
  <a class="logo" href="./"><i></i>passk${studio ? " <span>studio · local</span>" : ""}</a>
  <div class="right"><a class="btn" href="https://github.com/tohirr/solari-cookbook/tree/main/passk">GitHub</a>${studio ? `<a class="btn" href="https://tohirr.github.io/solari-cookbook/passk/">Published board</a>` : `<a class="btn primary" href="https://github.com/tohirr/solari-cookbook/tree/main/passk#setup">Run your own task</a>`}</div>
</div></div>
<main>
  <h1>Which model can actually do your computer task, reliably?</h1>
  <p class="sub">Pick the shape of your task. Every row is <b>k forks of one desktop snapshot</b>, same prompt, and every outcome is graded <b>inside the VM</b>, never by what the agent says.${studio ? " Runs start from this page and use the keys on this machine." : " Browsing is free. Running is one command."}</p>

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

  ${studio ? `
  <div class="card" id="runcard" style="margin-top:28px">
    <h3>Run a model on this shape</h3>
    <p class="hint">Forks the shape's snapshot k times on your Solari account, runs the agent on each fork with your model key, grades every run inside the VM, and adds the row above. Prepares the snapshot first if this machine has none.</p>
    <div class="fields">
      <div class="field"><label>Model</label><select id="rmodel">${models.map((m) => `<option value="${esc(m)}">${esc(m)}${m === "scripted" ? " · demo, no VM, no keys" : ""}</option>`).join("")}</select></div>
      <div class="field"><label>Condition</label><select id="rtask"></select></div>
      <div class="field"><label>Runs (k)</label><input id="rk" type="number" min="1" max="200" value="10"></div>
      <div class="field"><label>Concurrency</label><input id="rc" type="number" min="1" max="10" value="2"></div>
      <div class="field"><label>Budget, USD</label><input id="rb" type="number" min="0" step="0.25" value="1"></div>
    </div>
    <div class="row">
      <label class="check"><input id="rsafety" type="checkbox" checked> acknowledge the model's safety checks inside the disposable VM</label>
    </div>
    <div class="row"><button class="btn primary" id="rgo" type="button">Start</button><span class="est" id="rest"></span></div>
    <div class="msg" id="rmsg"></div>
    <div class="jobs" id="jobs"></div>
  </div>

  <div class="card" id="keycard" style="margin-top:14px">
    <h3>Keys</h3>
    <p class="hint">Stored in <code>passk/.env</code> on this machine and sent only to Solari and the model provider by the runs you start. This page never shows a stored key.</p>
    <form class="keys" id="keys" onsubmit="return false">
      <div class="field"><label>Solari <span id="k-SOLARI_API_KEY"></span></label><input name="SOLARI_API_KEY" type="password" placeholder="slr_live_…" autocomplete="off"></div>
      <div class="field"><label>OpenAI <span id="k-OPENAI_API_KEY"></span></label><input name="OPENAI_API_KEY" type="password" placeholder="sk-…" autocomplete="off"></div>
      <div class="field"><label>Anthropic <span id="k-ANTHROPIC_API_KEY"></span></label><input name="ANTHROPIC_API_KEY" type="password" placeholder="sk-ant-…" autocomplete="off"></div>
      <div class="field"><button class="btn" id="ksave" type="button">Save to .env</button></div>
    </form>
    <div class="msg" id="kmsg"></div>
  </div>` : ""}

  <div class="fine">
    <div id="totals">${totals.runs} verified runs · ${shapes.length} task shapes · ${totals.models} model${totals.models === 1 ? "" : "s"} with evidence · ${usd(totals.spend, 2)} of model spend in total. Every number on this page is read from ${studio ? "the bench files in <code>evidence/</code> and <code>runs/</code>" : `<a href="evidence/">the published bench files</a>`}.</div>
    <div><a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/METHOD.md">How it is measured</a> · <a href="evidence/index.html">Evidence and findings</a> · <a href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/TASKS.md">Write a task</a> · built on <a href="https://getsolari.com">Solari</a></div>
  </div>
</main>
<script>
const MODE = ${JSON.stringify(page.mode)};
let SHAPES = ${JSON.stringify(shapes)};
let KEYS = ${JSON.stringify(page.keys ?? {})};
let JOBS = [];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x) => Math.round(x * 100) + "%";
const usd = (x, d = 3) => x === null || x === undefined ? "—" : "$" + x.toFixed(d);
const providerFor = (m) => m === "scripted" ? "scripted" : m.startsWith("claude") ? "anthropic" : "openai";
const keyFor = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", scripted: null };
let current = SHAPES[0].id;
const shape = () => SHAPES.find((x) => x.id === current);
const $ = (id) => document.getElementById(id);

function chips() {
  $("chips").innerHTML = SHAPES.map((s) => \`<button type="button" class="chip\${s.id === current ? " on" : ""}" data-id="\${s.id}">\${esc(s.name)}</button>\`).join("")
    + \`<a class="chip more" href="https://github.com/tohirr/solari-cookbook/blob/main/passk/docs/TASKS.md">+ propose a shape</a>\`;
}
function cmdFor(r, s) {
  const budget = r.estimate ? Math.ceil(r.estimate * 2 * 4) / 4 : 1;
  return \`PASSK_MODEL=\${r.model} npm run passk run tasks/\${r.task}.yaml -- --k \${r.k} --budget \${budget}\`;
}
function row(r, s) {
  if (r.state === "unrun") return \`<tr class="unrun"><td class="model"><b>\${esc(r.model)}</b><span>\${esc(r.condition)}</span></td>
    <td><div class="rate"><div class="track"></div><div class="v" style="color:var(--ink-3)">—</div></div></td>
    <td class="num dim">—</td><td class="num dim">—</td><td class="fails" style="color:var(--ink-3)">—</td>
    <td><span class="pill no">not yet run</span></td>
    <td><button type="button" class="btn primary run" data-model="\${esc(r.model)}" data-task="\${esc(r.task)}" data-k="\${r.k}">Run · \${r.estimate !== undefined ? "est. " + usd(r.estimate, 2) : "your keys"}</button>\${MODE === "static" ? \`<div class="cmd">\${esc(cmdFor(r, s))}\\n<span style="color:var(--ink-3)"># from passk/ with SOLARI_API_KEY and the model's key in .env · the report lands in runs/</span></div>\` : ""}</td></tr>\`;
  const lo = r.lower * 100, hi = r.upper * 100, p = r.n ? (r.passed / r.n) * 100 : 0;
  if (r.state === "running") return \`<tr><td class="model"><b>\${esc(r.model)}</b><span>\${esc(r.condition)}</span></td>
    <td><div class="rate"><div class="track"><div class="fill" style="width:\${(r.n / r.k) * 100}%"></div></div><div class="v">\${r.passed}/\${r.n} <span>of \${r.k}</span></div></div></td>
    <td class="num dim">—</td><td class="num">\${usd(r.spent, 2)}</td><td class="fails">\${esc(r.failures)}</td>
    <td><span class="pill live">running · \${r.n}/\${r.k}</span></td>
    <td><a class="btn" href="\${esc(r.href)}">Open</a></td></tr>\`;
  return \`<tr><td class="model"><b>\${esc(r.model)}</b><span>\${esc(r.condition)}</span></td>
    <td><div class="rate"><div class="track"><div class="band" style="left:\${lo}%;width:\${hi - lo}%"></div><div class="pt" style="left:\${p}%"></div></div><div class="v">\${r.passed}/\${r.n} <span>\${pct(r.lower)}–\${pct(r.upper)}</span></div></div></td>
    <td class="num">\${pct(r.pow5)}</td><td class="num">\${usd(r.perSuccess)}</td>
    <td class="fails">\${esc(r.failures)}</td>
    <td><span class="pill \${r.state === "verified" ? "ok" : "local"}" title="\${esc(r.date)}">\${r.state === "verified" ? "verified" : "local · " + esc(r.date)}</span></td>
    <td><a class="btn" href="\${esc(r.href)}">Open</a></td></tr>\`;
}
function render() {
  const s = shape();
  $("sname").textContent = s.name;
  $("sblurb").textContent = s.blurb;
  $("sk").innerHTML = \`k = <code>\${s.k}</code> · \${s.k} passes prove at least \${pct(s.proves)}\`;
  $("rows").innerHTML = s.rows.map((r) => row(r, s)).join("");
  chips();
  if (MODE === "studio") { renderRunForm(); renderKeys(); renderJobs(); }
}
function match(text) {
  const t = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const s of SHAPES) {
    const score = s.keywords.reduce((n, k) => n + (t.includes(k) ? (k.length > 5 ? 2 : 1) : 0), 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  const m = $("match");
  if (!t.trim()) { m.innerHTML = "closest shape: <b>—</b>"; return; }
  if (!best) { m.innerHTML = "no close shape yet · <b>propose one</b>"; return; }
  m.innerHTML = \`closest shape: <b>\${esc(best.name)}</b>\`;
  if (best.id !== current) { current = best.id; render(); }
}
$("chips").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (!b) return; current = b.dataset.id; render(); });
$("q").addEventListener("input", (e) => match(e.target.value));
const q0 = new URLSearchParams(location.search).get("shape"); if (q0 && SHAPES.some((s) => s.id === q0)) current = q0;

// ---------- studio: keys, runs, jobs ----------
function renderKeys() {
  for (const k of ["SOLARI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
    const el = $("k-" + k); if (!el) continue;
    el.innerHTML = KEYS[k] ? '<span class="pill ok">set</span>' : '<span class="pill no">missing</span>';
  }
}
function renderRunForm() {
  const s = shape();
  const sel = $("rtask"); if (!sel) return;
  const prev = sel.value;
  const conds = $("rmodel").value === "scripted" ? { fake: "harness test · no VM, no model" } : s.conditions;
  sel.innerHTML = Object.entries(conds).map(([t, c]) => \`<option value="\${esc(t)}">\${esc(c)} · \${esc(t)}</option>\`).join("");
  if (prev && conds[prev]) sel.value = prev;
  if (!$("rk").dataset.touched) $("rk").value = String(Math.min(s.k, 10));
  estimate();
}
function estimate() {
  const s = shape(); const m = $("rmodel").value; const k = Math.max(1, Number($("rk").value) || 1);
  const per = s.perRun[m] ?? 0; const est = per * k;
  const need = keyFor[providerFor(m)];
  const missing = (m !== "scripted" && !KEYS.SOLARI_API_KEY) ? "SOLARI_API_KEY" : (need && !KEYS[need]) ? need : null;
  $("rest").innerHTML = m === "scripted" ? "no spend: the scripted agent runs in memory" : \`est. model spend <b>\${usd(est, 2)}</b> for \${k} runs · \${k} passes prove at least \${pct(wilsonLower(k))}\` + (missing ? \` · <span style="color:var(--warn)">needs \${missing}</span>\` : "");
  $("rgo").disabled = !!missing;
}
function wilsonLower(n) { const z = 1.96, z2 = z * z; const p = 1; const d = 1 + z2 / n; const c = p + z2 / (2 * n); const h = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n)); return (c - h) / d; }
async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function renderJobs() {
  const el = $("jobs"); if (!el) return;
  el.innerHTML = JOBS.slice().reverse().map((j) => \`<div class="job"><div><b>\${esc(j.model)}</b> on <b>\${esc(j.task)}</b> · k=\${j.k} · <span class="pill \${j.status === "running" ? "live" : j.status === "done" ? "ok" : "no"}">\${esc(j.status)}</span>
      <div class="sub2">\${j.progress ? \`\${j.progress.done}/\${j.k} runs · \${j.progress.passed} passed · \${usd(j.progress.spent, 2)} spent\` : esc(j.phase || "starting")}\${j.error ? \` · <span style="color:var(--crit)">\${esc(j.error)}</span>\` : ""}</div>
      \${j.progress ? \`<div class="bar2"><i style="width:\${(j.progress.done / j.k) * 100}%"></i></div>\` : ""}
      <div class="log">\${esc((j.log || []).slice(-3).join("\\n"))}</div></div>
    <div>\${j.status === "running" ? \`<button type="button" class="btn danger" data-cancel="\${j.id}">Stop</button>\` : j.href ? \`<a class="btn" href="\${esc(j.href)}">Open report</a>\` : ""}</div></div>\`).join("");
}
async function refresh() {
  try {
    const st = await api("/api/state");
    SHAPES = st.shapes; KEYS = st.keys; JOBS = st.jobs;
    $("totals").innerHTML = st.totalsHtml;
    render();
  } catch (e) { $("rmsg").textContent = "lost the local server: " + e.message; $("rmsg").className = "msg bad"; }
}
if (MODE === "studio") {
  $("rows").addEventListener("click", (e) => {
    const b = e.target.closest("button.run"); if (!b) return;
    $("rmodel").value = b.dataset.model; $("rtask").value = b.dataset.task; $("rk").value = b.dataset.k; $("rk").dataset.touched = "1"; estimate();
    $("runcard").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("rmodel").addEventListener("change", renderRunForm);
  $("rk").addEventListener("input", () => { $("rk").dataset.touched = "1"; estimate(); });
  $("rgo").addEventListener("click", async () => {
    $("rmsg").className = "msg"; $("rmsg").textContent = "starting…";
    try {
      const j = await api("/api/run", { task: $("rtask").value, model: $("rmodel").value, k: Number($("rk").value), concurrency: Number($("rc").value), budget: Number($("rb").value), safety: $("rsafety").checked });
      $("rmsg").className = "msg good"; $("rmsg").textContent = "started · " + j.cmd;
      refresh();
    } catch (e) { $("rmsg").className = "msg bad"; $("rmsg").textContent = e.message; }
  });
  $("jobs").addEventListener("click", async (e) => { const b = e.target.closest("button[data-cancel]"); if (!b) return; await api("/api/jobs/" + b.dataset.cancel + "/cancel", {}); refresh(); });
  $("ksave").addEventListener("click", async () => {
    const fd = new FormData($("keys")); const body = {};
    for (const [k, v] of fd.entries()) if (String(v).trim()) body[k] = String(v).trim();
    if (!Object.keys(body).length) { $("kmsg").className = "msg bad"; $("kmsg").textContent = "nothing to save"; return; }
    try { await api("/api/keys", body); $("keys").reset(); $("kmsg").className = "msg good"; $("kmsg").textContent = "saved to .env"; refresh(); }
    catch (e) { $("kmsg").className = "msg bad"; $("kmsg").textContent = e.message; }
  });
  setInterval(() => { if (JOBS.some((j) => j.status === "running")) refresh(); }, 2000);
} else {
  $("rows").addEventListener("click", (e) => { const b = e.target.closest("button.run"); if (!b) return; b.closest("tr").classList.toggle("open"); });
}
render();
</script>
</body></html>`;
}

export function totalsOf(benches: BoardBench[]): BoardPage["totals"] {
  const verified = benches.filter((x) => x.source === "evidence");
  return { runs: verified.reduce((a, x) => a + x.b.runs.length, 0), spend: verified.reduce((a, x) => a + x.b.metrics.totalCostUsd, 0), models: new Set(verified.map((x) => x.b.model)).size };
}
