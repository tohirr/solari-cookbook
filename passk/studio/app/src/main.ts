/**
 * passk studio: a browser front for the evidence folder. Tasks, the
 * experiments run on them, the controlled comparisons between experiments,
 * and a planner that says what a proposed run can prove and what it will
 * cost before anyone spends a cent. This build is static and read-only:
 * everything on screen comes from data.json, which is generated from the
 * bench and comparison files, and the reports it opens are the ones passk
 * wrote. Starting runs needs the local studio (`passk serve`), not this page.
 */
import { runsForLowerBound, wilson } from "../../../src/metrics.js";
import { CSS, TIP_JS, dotsHtml, esc, pct, secs, usd } from "../../../src/report/theme.js";
import type { Check } from "../../../src/types.js";
import type { StudioBench, StudioCompare, StudioData, StudioTask } from "../../../scripts/studio-data.js";

/** Where the exported benches live, relative to studio/index.html. */
const EVIDENCE = "../evidence";
/** The reliability floor the home page grades against: the same 0.7 the README's gate example uses. */
const FLOOR = 0.7;

const STUDIO_CSS = `
.bar{position:sticky;top:0;z-index:5;background:rgba(14,15,18,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar .in{max-width:1120px;margin:0 auto;padding:0 28px;height:56px;display:flex;align-items:center;gap:26px}
.bar .logo{font-weight:700;font-size:15px;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:8px}
.bar .logo i{width:12px;height:12px;border-radius:50%;background:var(--good);display:inline-block}
.bar nav{display:flex;gap:4px}
.bar nav a{color:var(--ink-2);text-decoration:none;font-size:13.5px;padding:6px 10px;border-radius:8px}
.bar nav a.on{color:var(--ink);background:var(--surface-2)}
.bar .right{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--ink-3)}
.bar nav a{white-space:nowrap}
@media(max-width:960px){.bar .right span{display:none}.bar .in{gap:14px}}
main.studio{padding-top:34px}
.btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;border:1px solid var(--line-2);background:transparent;padding:7px 12px;border-radius:9px;cursor:pointer;font-family:var(--sans)}
.btn:hover{background:var(--surface-2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#141306}
.btn.primary:hover{filter:brightness(1.06)}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.btn.sm{font-size:12px;padding:5px 10px}
.hero{margin:0 0 26px}.hero h1{font-size:34px;line-height:1.1;margin:0 0 8px}.hero p{color:var(--ink-2);font-size:15px;max-width:760px;margin:0}
.strip{display:flex;gap:26px;flex-wrap:wrap;padding:14px 0 22px;border-bottom:1px solid var(--line);margin-bottom:22px}
.strip div{font-size:13px;color:var(--ink-3)}.strip b{display:block;font-size:22px;color:var(--ink);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:14px}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
.tcard h3{margin:0;font-size:17px;font-weight:650;letter-spacing:-.01em}
.tcard .meta{margin:4px 0 14px}
.tcard .head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:14px 0 4px}
.tcard .head b{font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tcard .head span{color:var(--ink-2);font-size:13px}
.tcard .actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
.pill.good{background:var(--good-dim);color:var(--good)}.pill.warn{background:rgba(245,165,36,.18);color:var(--warn)}.pill.crit{background:var(--crit-dim);color:var(--crit)}
.section{margin:34px 0 0}
.two>div{min-width:0}
.plan{display:grid;grid-template-columns:380px 1fr;gap:16px;align-items:start}
@media(max-width:860px){.plan{grid-template-columns:1fr}}
.field{display:grid;gap:5px;margin-bottom:14px}.field label{font-size:12px;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase}
.field select,.field input{width:100%;min-width:0;background:var(--surface-2);border:1px solid var(--line-2);color:var(--ink);border-radius:8px;padding:8px 10px;font:14px var(--sans)}
.field .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.proof{display:grid;gap:12px}
.proof .card b.big{display:block;font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-bottom:4px}
.proof .card span{color:var(--ink-2);font-size:13px}
.cmd{background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-s);padding:12px 14px;font:12.5px/1.6 var(--mono);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px}
.frame{width:100%;height:calc(100vh - 96px);border:0;display:block;background:var(--bg)}
.framebar{max-width:1120px;margin:0 auto;padding:10px 28px;display:flex;gap:14px;align-items:center;font-size:13px;color:var(--ink-3)}
.framebar a{color:var(--ink-2)}
table a{color:var(--ink-2)}
.yaml{font:12.5px/1.55 var(--mono);color:var(--ink-2);background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-s);padding:14px 16px;white-space:pre;overflow-x:auto;margin:0}
.checklist{display:grid;gap:6px;font-size:13.5px}.checklist code{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.empty{color:var(--ink-3);font-size:13.5px;padding:24px;border:1px dashed var(--line-2);border-radius:var(--radius);text-align:center}
`;

let data: StudioData;

// ---------- helpers ----------

const byDate = (a: StudioBench, b: StudioBench) => b.startedAt.localeCompare(a.startedAt);
const benchesFor = (taskId: string) => data.benches.filter((b) => b.taskId === taskId).sort(byDate);
const latest = (taskId: string) => benchesFor(taskId)[0];
const day = (iso: string) => iso.slice(0, 10);
const attempted = (b: StudioBench) => b.runs.filter((r) => !(r.status === "errored" && r.steps === 0));
const dots = (b: StudioBench, cls = "") => dotsHtml(b.runs, b.metrics.skipped, cls, (i) => `#/report/${b.dir}?run=${i}`);

function checkLabel(c: Check): string {
  if (c.name) return c.name;
  const what = "path" in c ? c.path : "cmd" in c ? `${c.cmd} ${(c.args ?? []).join(" ")}`.trim() : "";
  return `${c.type} ${what}`.trim();
}

/** One phrase and one colour for a bench, graded against the floor. */
function grade(b: StudioBench): { text: string; cls: "good" | "warn" | "crit" | "neutral" } {
  const m = b.metrics;
  if (b.status !== "complete") return { text: b.status, cls: "neutral" };
  if (m.n === 0) return { text: "nothing scorable", cls: "crit" };
  if (m.passAt1Lower >= FLOOR) return { text: `clears the ${pct(FLOOR)} floor`, cls: "good" };
  if (m.passed === m.n) return { text: `all passed · sample too small to prove ${pct(FLOOR)}`, cls: "warn" };
  if (m.passAt1 >= FLOOR) return { text: `${pct(m.passAt1)} observed · floor not proven`, cls: "warn" };
  return { text: `below the ${pct(FLOOR)} floor`, cls: "crit" };
}

const pill = (g: { text: string; cls: string }) => `<span class="pill ${g.cls}">${esc(g.text)}</span>`;

/** pass^5 from the stored table, keyed by number-as-string once it has been through JSON. */
const pow5 = (m: StudioBench["metrics"]) => (m.passPowK as unknown as Record<string, number>)[String(Math.min(5, m.n))] ?? 0;

// ---------- pages ----------

function home(): string {
  const tasks = [...data.tasks].sort((a, b) => (latest(b.id)?.startedAt ?? "").localeCompare(latest(a.id)?.startedAt ?? ""));
  const runs = data.benches.reduce((s, b) => s + b.runs.length, 0);
  const spend = data.benches.reduce((s, b) => s + b.metrics.totalCostUsd, 0);
  const cards = tasks.map((t) => {
    const b = latest(t.id);
    if (!b) return `<div class="card tcard"><h3>${esc(t.name)}</h3><div class="meta">not yet run</div><div class="actions"><a class="btn sm" href="#/tasks/${esc(t.id)}">Task</a><a class="btn sm primary" href="#/new?task=${esc(t.id)}">Plan a run</a></div></div>`;
    const m = b.metrics;
    return `<div class="card tcard">
      <h3><a href="#/tasks/${esc(t.id)}" style="text-decoration:none">${esc(t.name)}</a></h3>
      <div class="meta"><code>${esc(b.model)}</code> · k=${b.k} · ${day(b.startedAt)}${benchesFor(t.id).length > 1 ? ` · ${benchesFor(t.id).length} experiments` : ""}</div>
      ${dots(b)}
      <div class="head"><b>${m.passed}/${m.n} passed</b><span>${pct(m.passAt1Lower)}–${pct(m.passAt1Upper)} plausible · pass^${Math.min(5, m.n) || 1} ${pct(pow5(m))} · ${usd(m.totalCostUsd, 2)}</span></div>
      ${pill(grade(b))}
      <div class="actions"><a class="btn sm" href="#/report/${esc(b.dir)}">Report</a><a class="btn sm" href="#/tasks/${esc(t.id)}">History</a>${data.compares.some((c) => c.a.dir === b.dir || c.b.dir === b.dir) ? `<a class="btn sm" href="#/comparisons">Comparisons</a>` : ""}<a class="btn sm primary" href="#/new?task=${esc(t.id)}">Run again</a></div>
    </div>`;
  }).join("");
  return `<div class="hero"><h1>Reliability tests</h1><p>Each task is run repeatedly from one Solari snapshot, graded inside the VM, and reported with its uncertainty. Every number here is read from the published evidence.</p></div>
  <div class="strip"><div><b>${data.tasks.length}</b>tasks</div><div><b>${data.benches.length}</b>experiments</div><div><b>${runs}</b>verified runs</div><div><b>${data.compares.length}</b>controlled comparisons</div><div><b>${usd(spend, 2)}</b>model spend, all of it</div></div>
  <div class="grid">${cards}</div>`;
}

function taskPage(id: string): string {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return `<div class="empty">No task “${esc(id)}”.</div>`;
  const hist = benchesFor(id);
  const comps = data.compares.filter((c) => hist.some((b) => b.dir === c.a.dir || b.dir === c.b.dir));
  const rows = hist.map((b) => `<tr><td>${day(b.startedAt)}</td><td><code>${esc(b.model)}</code></td><td class="num">${b.k}</td><td class="num">${b.metrics.passed}/${b.metrics.n}</td><td class="num">${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)}</td><td class="num">${b.metrics.medianSteps}</td><td class="num">${usd(b.metrics.totalCostUsd, 2)}</td><td>${pill(grade(b))}</td><td><a href="#/report/${esc(b.dir)}">report</a></td></tr>`).join("");
  return `<div class="hero"><div class="meta"><a href="#/">Tasks</a> / ${esc(t.id)}</div><h1>${esc(t.name)}</h1>
    <p><span class="pill neutral">${esc(t.template)} template</span> <span class="pill neutral">${t.maxSteps ? `${t.maxSteps} step cap` : "no step cap"}</span> <span class="pill ${t.hasGolden ? "good" : "warn"}">${t.hasGolden ? "golden steps: verifier can be validated" : "no golden steps"}</span></p></div>
  <div class="two">
    <div><h2>Prompt</h2><blockquote class="prompt">${esc(t.prompt)}</blockquote>
      <h2>Checks · graded inside the VM</h2><div class="checklist">${t.checks.length ? t.checks.map((c) => `<div>✓ ${esc(checkLabel(c))}${c.invariant ? ` <span class="pill neutral">invariant</span>` : ""}${c.name ? `<br><code>${esc(JSON.stringify({ ...c, name: undefined }))}</code>` : ""}</div>`).join("") : `<div class="empty">Task file not in this build; checks are recorded in each report's provenance.</div>`}</div></div>
    <div><h2>Task file</h2>${t.yaml ? `<pre class="yaml">${esc(t.yaml)}</pre>` : `<div class="empty">not included</div>`}</div>
  </div>
  <div class="section"><h2 style="margin-top:0">Experiments (${hist.length})</h2>
  ${hist.length ? `<div class="card" style="padding:0;overflow-x:auto"><table><tr><th>date</th><th>model</th><th class="num">k</th><th class="num">passed</th><th class="num">95% interval</th><th class="num">median steps</th><th class="num">spend</th><th></th><th></th></tr>${rows}</table></div>` : `<div class="empty">No experiments yet.</div>`}
  <div style="margin-top:14px;display:flex;gap:8px"><a class="btn primary" href="#/new?task=${esc(t.id)}">Plan a run</a>${hist.length >= 2 ? `<span class="note" style="margin:0;align-self:center">Compare two: <code>npm run passk compare ${esc(EVIDENCE)}/${esc(hist[1].dir)} ${esc(EVIDENCE)}/${esc(hist[0].dir)}</code></span>` : ""}</div></div>
  ${comps.length ? `<div class="section"><h2 style="margin-top:0">Comparisons</h2>${compareCards(comps)}</div>` : ""}`;
}

function experiments(): string {
  const rows = [...data.benches].sort(byDate).map((b) => `<tr><td>${day(b.startedAt)}</td><td><a href="#/tasks/${esc(b.taskId)}">${esc(b.taskName)}</a></td><td><code>${esc(b.model)}</code></td><td class="num">${b.k}</td><td class="num">${b.metrics.passed}/${b.metrics.n}</td><td class="num">${pct(b.metrics.passAt1Lower)}–${pct(b.metrics.passAt1Upper)}</td><td class="num">${pct(pow5(b.metrics))}</td><td class="num">${b.metrics.medianSteps}</td><td class="num">${usd(b.metrics.totalCostUsd, 2)}</td><td>${pill(grade(b))}</td><td><a href="#/report/${esc(b.dir)}">report</a></td></tr>`).join("");
  return `<div class="hero"><h1>Experiments</h1><p>One row per bench: a task, run k times from one snapshot under one configuration.</p></div>
  <div class="card" style="padding:0;overflow-x:auto"><table><tr><th>date</th><th>task</th><th>model</th><th class="num">k</th><th class="num">passed</th><th class="num">95% interval</th><th class="num">pass^5</th><th class="num">median steps</th><th class="num">spend</th><th></th><th></th></tr>${rows}</table></div>`;
}

function compareCards(comps: StudioCompare[]): string {
  return `<div class="grid">${comps.map((c) => {
    const dp = Math.round(c.delta.passAt1 * 100);
    const sig = c.fisherP < 0.05 ? `<span class="pill good">unlikely to be noise · p ${c.fisherP.toFixed(3)}</span>` : `<span class="pill neutral">consistent with noise · p ${c.fisherP.toFixed(2)}</span>`;
    return `<div class="card tcard"><h3>${esc(c.changed.length ? c.changed.join(" and ") : "nothing")} changed</h3>
      <div class="meta">held fixed: ${c.heldFixed.map((h) => `<code>${esc(h)}</code>`).join(" ")}</div>
      <div style="font-size:13.5px;color:var(--ink-2)"><span class="pill a">A</span> ${esc(c.a.taskName)}<br><span class="pill b">B</span> ${esc(c.b.taskName)}</div>
      <div class="head"><b>${esc(c.passes.a)} → ${esc(c.passes.b)}</b><span>${dp === 0 ? "±0" : `${dp > 0 ? "+" : "−"}${Math.abs(dp)}`} pts · pass^${c.powK} ${c.delta.passPowK === 0 ? "±0" : `${c.delta.passPowK > 0 ? "+" : "−"}${Math.abs(Math.round(c.delta.passPowK * 100))}`} pts · ${c.delta.medianSteps === 0 ? "same" : `${c.delta.medianSteps > 0 ? "+" : "−"}${Math.abs(c.delta.medianSteps)}`} median steps</span></div>
      ${sig}${c.warnings.map((w) => `<div class="note" style="color:var(--warn)">⚠ ${esc(w)}</div>`).join("")}
      <div class="actions"><a class="btn sm primary" href="#/comparison/${esc(c.dir)}">Open comparison</a><a class="btn sm" href="#/report/${esc(c.a.dir)}">A</a><a class="btn sm" href="#/report/${esc(c.b.dir)}">B</a></div></div>`;
  }).join("")}</div>`;
}

function comparisons(): string {
  return `<div class="hero"><h1>Controlled comparisons</h1><p>Two benches from the same snapshot with one thing changed. The page says what was held fixed, what moved, and whether the difference could be noise.</p></div>
  ${data.compares.length ? compareCards(data.compares) : `<div class="empty">No comparisons in this evidence set.</div>`}`;
}

/** The planner: what k runs can prove, and what they will cost, before spending. */
function planner(q: URLSearchParams): string {
  const taskId = q.get("task") ?? data.tasks[0]?.id ?? "";
  const k = Math.max(1, Number(q.get("k") ?? 10));
  const conc = Math.max(1, Number(q.get("c") ?? 2));
  const budget = Number(q.get("budget") ?? 1);
  const floor = Number(q.get("floor") ?? FLOOR);
  const prior = latest(taskId);
  const model = q.get("model") ?? prior?.model ?? data.models[0] ?? "";
  const t = data.tasks.find((x) => x.id === taskId);

  const opt = (v: string, label: string, sel: string) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(label)}</option>`;
  const tested = new Set(data.benches.map((b) => b.model));
  const form = `<div class="card">
    <div class="field"><label>Task</label><select name="task">${data.tasks.map((x) => opt(x.id, x.name, taskId)).join("")}</select></div>
    <div class="field"><label>Model</label><select name="model">${data.models.map((m) => opt(m, tested.has(m) ? m : `${m} · untested`, model)).join("")}</select></div>
    <div class="field"><div class="row"><div><label>Runs (k)</label><input name="k" type="number" min="1" max="200" value="${k}"></div><div><label>Concurrency</label><input name="c" type="number" min="1" max="10" value="${conc}"></div></div></div>
    <div class="field"><div class="row"><div><label>Budget, USD</label><input name="budget" type="number" min="0" step="0.25" value="${budget}"></div><div><label>Reliability floor</label><input name="floor" type="number" min="0.5" max="0.99" step="0.05" value="${floor}"></div></div></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:6px"><button class="btn primary" disabled title="This is the static build. Start runs from the local studio or with the command on the right.">Start run</button><span class="note" style="margin:0">static build · read only</span></div>
  </div>`;

  // What all-pass at k proves, and how many runs the floor needs.
  const allPass = wilson(k, k).lower;
  const need = runsForLowerBound(floor);
  // Spend and time from the most relevant prior: same task and model, else same task, else same model.
  const priorSame = benchesFor(taskId).find((b) => b.model === model);
  const priorTask = prior;
  const priorModel = data.benches.filter((b) => b.model === model).sort(byDate)[0];
  const ref = priorSame ?? priorTask ?? priorModel;
  const refWhy = priorSame ? "from this task's last bench on this model" : priorTask ? `from this task's last bench, on <code>${esc(priorTask.model)}</code> · this model may differ` : priorModel ? `from <code>${esc(priorModel.taskName)}</code> on this model · a different task` : "";
  const perRun = ref ? ref.metrics.totalCostUsd / Math.max(1, attempted(ref).length) : null;
  const est = perRun !== null ? perRun * k : null;
  const runsWithinBudget = perRun ? Math.floor(budget / perRun) : null;
  const wall = ref ? (ref.metrics.medianDurationMs || 0) * Math.ceil(k / conc) : null;

  const proof = `<div class="proof">
    <div class="card"><b class="big">${pct(allPass)}</b><span>is the most ${k} runs can prove: if all ${k} pass, the pass rate is at least ${pct(allPass)} at 95% confidence (Wilson lower bound).</span></div>
    <div class="card"><b class="big">${need} runs</b><span>all passing are needed to establish the ${pct(floor)} floor${k >= need ? `; k=${k} is enough` : `; k=${k} cannot, whatever the outcome`}.</span></div>
    <div class="card"><b class="big">${est === null ? "—" : usd(est, 2)}</b><span>estimated model spend for ${k} runs${perRun !== null ? ` at ${usd(perRun)} per attempted run, ${refWhy}` : " · no prior bench to estimate from"}.${runsWithinBudget !== null && runsWithinBudget < k ? ` <b style="color:var(--warn)">The $${budget} budget stops the bench after about ${runsWithinBudget} runs.</b>` : ""}</span></div>
    <div class="card"><b class="big">${wall === null ? "—" : secs(wall).replace(/^(\d+)s$/, (_, s) => `${Math.round(Number(s) / 60)} min`)}</b><span>rough wall time: median run ${ref ? secs(ref.metrics.medianDurationMs) : "?"} × ${Math.ceil(k / conc)} waves at concurrency ${conc}.</span></div>
    <div class="card"><span>To run this locally, from <code>passk/</code>:</span><div class="cmd">PASSK_MODEL=${esc(model)} npm run passk run tasks/${esc(taskId)}.yaml -- --k ${k} --concurrency ${conc} --budget ${budget} --require-lower ${floor}</div><span class="note">Validate the task first if it is new: <code>npm run passk validate tasks/${esc(taskId)}.yaml</code>. The gate flag makes the bench exit non-zero if the floor is not proven.</span></div>
  </div>`;

  return `<div class="hero"><h1>Plan a run</h1><p>Decide k and the budget from what the numbers can prove, not from habit. ${t ? `Task: <b>${esc(t.name)}</b>.` : ""}</p></div>
  <form id="plan" class="plan">${form}${proof}</form>`;
}

function frame(kind: "report" | "comparison", dir: string, q: URLSearchParams): string {
  const file = kind === "report" ? "report.html" : "compare.html";
  const run = q.get("run");
  const src = `${EVIDENCE}/${dir}/${file}${run !== null ? `#run-${run}` : ""}`;
  const b = data.benches.find((x) => x.dir === dir);
  const back = b ? `<a href="#/tasks/${esc(b.taskId)}">${esc(b.taskName)}</a>` : `<a href="#/comparisons">comparisons</a>`;
  return `<div class="framebar"><a href="#/">Tasks</a> / ${back} / ${esc(dir)} <a href="${esc(src)}" target="_blank" style="margin-left:auto">open in its own tab ↗</a></div><iframe class="frame" src="${esc(src)}" title="${esc(dir)}"></iframe>`;
}

// ---------- shell and router ----------

function shell(page: string, active: string, full = false): string {
  const nav = [["#/", "Tasks", "tasks"], ["#/experiments", "Experiments", "experiments"], ["#/comparisons", "Comparisons", "comparisons"], ["#/new", "Plan a run", "new"]]
    .map(([href, label, key]) => `<a href="${href}" class="${key === active ? "on" : ""}">${label}</a>`).join("");
  return `<div class="bar"><div class="in"><a class="logo" href="#/"><i></i>passk <span style="color:var(--ink-3);font-weight:500">studio</span></a><nav>${nav}</nav><div class="right"><span>static · read from <code>${esc(data.evidenceDir)}</code></span><a class="btn sm" href="../evidence/index.html">showcase</a><a class="btn sm" href="https://github.com/tohirr/solari-cookbook/tree/main/passk">GitHub</a></div></div></div>
  ${full ? page : `<main class="studio">${page}</main>`}`;
}

function route(): void {
  const hash = location.hash.replace(/^#\/?/, "");
  const [pathPart, query = ""] = hash.split("?");
  const q = new URLSearchParams(query);
  const seg = pathPart.split("/").filter(Boolean);
  const app = document.getElementById("app")!;
  let html: string;
  if (seg.length === 0) html = shell(home(), "tasks");
  else if (seg[0] === "tasks" && seg[1]) html = shell(taskPage(decodeURIComponent(seg[1])), "tasks");
  else if (seg[0] === "experiments") html = shell(experiments(), "experiments");
  else if (seg[0] === "comparisons") html = shell(comparisons(), "comparisons");
  else if (seg[0] === "new") html = shell(planner(q), "new");
  else if ((seg[0] === "report" || seg[0] === "comparison") && seg[1]) html = shell(frame(seg[0], decodeURIComponent(seg[1]), q), seg[0] === "report" ? "experiments" : "comparisons", true);
  else html = shell(`<div class="empty">Nothing at <code>#/${esc(hash)}</code>.</div>`, "");
  app.innerHTML = html;
  if (!seg.length || seg[0] !== "report") window.scrollTo(0, 0);
  const plan = document.getElementById("plan") as HTMLFormElement | null;
  if (plan) plan.addEventListener("input", () => {
    const fd = new FormData(plan);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) params.set(k, String(v));
    location.hash = `#/new?${params.toString()}`;
  });
}

async function main(): Promise<void> {
  const style = document.createElement("style");
  style.textContent = `${CSS}\n:root{--accent:#f5c518}\nmain{padding-top:0}\n${STUDIO_CSS}`;
  document.head.appendChild(style);
  const res = await fetch("./data.json");
  if (!res.ok) { document.getElementById("app")!.innerHTML = `<main><div class="empty">data.json is missing. Run <code>npm run studio:data</code> and rebuild.</div></main>`; return; }
  data = await res.json();
  document.body.insertAdjacentHTML("beforeend", TIP_JS);
  addEventListener("hashchange", route);
  route();
}

main();
