/**
 * Charts for the pages that pitch and summarise: one picture per facet of a
 * bench, so a page is not a wall of identical dot grids. Every function
 * returns inline SVG or HTML in the report theme's tokens and takes nothing
 * that is not in a bench file, so the pictures cannot say more than the
 * evidence does. Hover text uses the theme's data-tip tooltip.
 */
import { esc, pct, secs } from "./theme.js";
import { wilson } from "../metrics.js";
import type { BenchResult, FailureAnalysis, RunResult } from "../types.js";

export const CHART_CSS = `
.chart{display:block;width:100%;height:auto;font:11px var(--sans)}
.chart text{fill:var(--ink-3)}
.chart .axis{stroke:var(--line-2);stroke-width:1}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart .ln.lower{stroke-width:1.25;stroke-dasharray:3 4;opacity:.8}
.chart .s-a{stroke:var(--a)}.chart .s-b{stroke:var(--b)}.chart .s-g{stroke:var(--a)}
.chart .lbl{font-size:11.5px;font-weight:600;fill:var(--ink)}
.chart .bar.passed{fill:var(--ink);opacity:.2}.chart .bar.failed{fill:var(--crit)}.chart .bar.errored{fill:var(--ink-3);opacity:.35}
.chart .bar:hover{opacity:1}
.chart .med{stroke:var(--ink-2);stroke-width:1}
.chart .whisker{stroke:var(--ink-2);stroke-width:1.5}
.chart .rate{fill:var(--a);opacity:.35}.chart .rate.a{fill:var(--a);opacity:.85}.chart .rate.b{fill:var(--b);opacity:.85}.chart .rate.n{fill:var(--ink-3);opacity:.45}
.chart .pt{fill:var(--a);stroke:var(--bg);stroke-width:2}
.chart .big{font-size:13px;font-weight:600;fill:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px 24px}
.tile{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:10px 0 0;min-width:0}
.tile .l{font:12.5px var(--sans);color:var(--ink-3);margin-bottom:6px}
.tile .v{font:600 24px/1.05 var(--sans);letter-spacing:-.01em;color:var(--ink)}
.tile .v small{font:12.5px var(--sans);color:var(--ink-3);margin-left:6px}
.tile .d{font:12.5px var(--sans);margin-top:6px;font-variant-numeric:tabular-nums}
.tile .d.up{color:var(--good-ink)}.tile .d.down{color:var(--crit-ink)}.tile .d.flat{color:var(--ink-3)}
.causebar{display:flex;gap:2px;height:12px;margin:10px 0 10px}
.causebar i{display:block;height:100%;border-radius:2px}
.causekey{display:flex;gap:16px;flex-wrap:wrap;font:12.5px var(--sans);color:var(--ink-2)}
.causekey i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.c-behavior_variability{background:var(--b)}.c-task_ambiguity{background:var(--a)}.c-stochastic_execution{background:#eda100}.c-unknown{background:var(--ink-3)}
.trace{display:grid;gap:14px}
.trace .lane{display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center}
@media(max-width:640px){.trace .lane{grid-template-columns:1fr;gap:6px}}
.trace .who{font:13px var(--sans);color:var(--ink-2)}.trace .who b{display:block;color:var(--ink);font-weight:600;font-size:14px}
.trace .who .pill{margin-top:4px}
.trace .tl{position:relative;height:32px;background:var(--surface-2);border-radius:var(--radius);overflow:hidden}
.trace .tl i{position:absolute;top:6px;bottom:6px;border-radius:2px;min-width:3px;opacity:.9}
.trace .tl i:hover{opacity:1;outline:1px solid var(--ink)}
.trace .tl i.click{background:var(--a)}.trace .tl i.keypress{background:#4a3aa7}.trace .tl i.type{background:#1baf7a}.trace .tl i.wait{background:var(--ink-3)}.trace .tl i.screenshot{background:var(--line-2)}.trace .tl i.scroll{background:#eda100}.trace .tl i.other{background:#e87ba4}
.trace .tl i.div{outline:2px solid var(--crit);outline-offset:-1px;z-index:1}
.trace .tl em{position:absolute;right:8px;top:8px;font:10.5px var(--mono);font-style:normal;color:var(--ink-3)}
.trace .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.trace .chips span{font:11px var(--mono);color:var(--ink-2);background:var(--surface-2);border-radius:3px;padding:2px 6px}
.trace .chips span.div{box-shadow:inset 0 0 0 1px var(--crit);color:var(--crit-ink)}
.trace .chips span.same{opacity:.55}
.tracekey{display:flex;gap:14px;flex-wrap:wrap;font:12px var(--sans);color:var(--ink-3);margin-top:4px}
.tracekey i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.said{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-top:16px}
@media(max-width:760px){.said{grid-template-columns:1fr}}
.said>div{min-width:0}
.said .cap{font:12.5px var(--sans);color:var(--ink-3);margin-bottom:6px}
.said img{width:100%;border-radius:var(--radius-s);border:1px solid var(--line);display:block;background:#000;aspect-ratio:16/9;object-fit:cover}
.said blockquote{margin:8px 0 0;padding:8px 12px;border-radius:var(--radius);font-size:14px;line-height:1.45}
.said .agent{background:var(--surface-2);color:var(--ink-2);font-style:italic}
.said .vm{background:var(--crit-dim);color:var(--crit-ink);font:12.5px var(--mono)}
.said .vm.ok{background:var(--good-dim);color:var(--good-ink)}
`;

const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

/** pass^k as a curve over k, one line per series, dashed for the lower bound. */
export function powKCurve(series: { label: string; cls: "a" | "b" | "g"; metrics: BenchResult["metrics"] }[], kMax = 20, w = 520, h = 180): string {
  const L = 36, R = 14, T = 12, B = 26;
  const iw = w - L - R, ih = h - T - B;
  const x = (k: number) => L + ((k - 1) / (kMax - 1)) * iw;
  const y = (p: number) => T + (1 - p) * ih;
  const at = (m: BenchResult["metrics"], table: "passPowK" | "passPowKLower", k: number) => (m[table] as unknown as Record<string, number>)[String(k)];
  const path = (m: BenchResult["metrics"], table: "passPowK" | "passPowKLower") => {
    const pts: string[] = [];
    for (let k = 1; k <= kMax; k++) {
      const v = at(m, table, k);
      if (v === undefined) break;
      pts.push(`${pts.length ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const ticksY = [0, 0.5, 1].map((p) => `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 6}" y="${y(p) + 3.5}" text-anchor="end">${pct(p)}</text>`).join("");
  const ticksX = [1, 5, 10, 15, 20].filter((k) => k <= kMax).map((k) => `<text x="${x(k)}" y="${h - 8}" text-anchor="middle">k=${k}</text>`).join("");
  const lines = series.map((s) => `<path class="ln lower s-${s.cls}" d="${path(s.metrics, "passPowKLower")}"/><path class="ln s-${s.cls}" d="${path(s.metrics, "passPowK")}"><title>${esc(s.label)}</title></path>`).join("");
  const labels = series.map((s) => {
    const kk = Math.min(kMax, 10);
    const v10 = at(s.metrics, "passPowK", kk) ?? 0;
    const vEnd = at(s.metrics, "passPowK", kMax) ?? v10;
    const ly = Math.min(Math.max(y(vEnd) - 7, T + 12), T + ih - 4);
    return `<text class="lbl ${s.cls}" x="${w - R}" y="${ly}" text-anchor="end">${esc(s.label)} · pass^${kk} ${pct(v10)}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="pass^k by k">${ticksY}${ticksX}<line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${T + ih}"/>${lines}${labels}</svg>`;
}

/** Every run as a bar, sorted by effort, failures in red, median marked. Reads as a spread, not a count. */
export function stepBars(b: BenchResult, w = 520, h = 120, href?: (runIndex: number) => string): string {
  const runs = b.runs.filter((r) => !(r.status === "errored" && r.steps.length === 0)).slice().sort((p, q) => p.steps.length - q.steps.length);
  if (!runs.length) return "";
  const L = 30, R = 6, T = 8, B = 20;
  const iw = w - L - R, ih = h - T - B;
  const max = Math.max(...runs.map((r) => r.steps.length));
  const bw = iw / runs.length, gap = Math.min(3, bw * 0.25);
  const y = (v: number) => T + (1 - v / max) * ih;
  const med = b.metrics.medianSteps;
  const bars = runs.map((r, i) => {
    const tip = `run ${r.runIndex}: ${r.status} in ${r.steps.length} steps, ${secs(r.durationMs)}`;
    const rect = `<rect class="bar ${r.status}" x="${(L + i * bw + gap / 2).toFixed(1)}" y="${y(r.steps.length).toFixed(1)}" width="${Math.max(1.5, bw - gap).toFixed(1)}" height="${(T + ih - y(r.steps.length)).toFixed(1)}" rx="1.5" data-tip="${esc(tip)}"/>`;
    return href ? `<a href="${esc(href(r.runIndex))}">${rect}</a>` : rect;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="steps per run">
    <text x="${L - 6}" y="${T + 4}" text-anchor="end">${max}</text><text x="${L - 6}" y="${T + ih}" text-anchor="end">0</text>
    <line class="axis" x1="${L}" x2="${w - R}" y1="${T + ih}" y2="${T + ih}"/>
    <line class="med" x1="${L}" x2="${w - R}" y1="${y(med)}" y2="${y(med)}"/><text x="${L + 4}" y="${T + 9}">median ${med} steps ┈</text>
    ${bars}
    <text x="${L}" y="${h - 6}">${runs.length} runs, sorted by steps</text><text x="${w - R}" y="${h - 6}" text-anchor="end">${runs[0].steps.length}–${max} steps</text>
  </svg>`;
}


/** Stat tiles with the delta from A to B. `better` says which direction is good. */
export function deltaTiles(items: { label: string; a: string; b: string; delta: number; unit?: string; better: "up" | "down"; digits?: number }[]): string {
  return `<div class="tiles">${items.map((t) => {
    const d = t.delta;
    const cls = d === 0 ? "flat" : (d > 0) === (t.better === "up") ? "up" : "down";
    const shown = t.digits !== undefined ? Math.abs(d).toFixed(t.digits) : fmt(Math.abs(d));
    return `<div class="tile"><div class="l">${esc(t.label)}</div><div class="v">${esc(t.b)}<small>from ${esc(t.a)}</small></div><div class="d ${cls}">${d === 0 ? "no change" : `${d > 0 ? "↑" : "↓"} ${shown}${t.unit ?? ""}`}</div></div>`;
  }).join("")}</div>`;
}


const kind = (s: RunResult["steps"][number]) => (["click", "keypress", "type", "wait", "screenshot", "scroll"].includes(s.name) ? s.name : "other");
const what = (s: RunResult["steps"][number]) => {
  const inp = s.input as Record<string, unknown>;
  if (s.name === "keypress") return `⌨ ${(inp.keys as string[] | undefined)?.join("+") ?? ""}`;
  if (s.name === "type") return `type "${String(inp.text ?? "").slice(0, 18)}${String(inp.text ?? "").length > 18 ? "…" : ""}"`;
  if (s.name === "click") return `click ${inp.x ?? ""},${inp.y ?? ""}`;
  if (s.name === "wait") return "wait";
  if (s.name === "screenshot") return "look";
  return s.name;
};

/**
 * A failing run against the passing run it was compared to, on one time
 * axis: every action a block, the first divergent step outlined, then what
 * the agent claimed beside what the checker found. `base` is the path to the
 * bench folder from the page that embeds this.
 */
export function traceCompare(b: BenchResult, f: FailureAnalysis, refIndex: number, base: string): string {
  const fail = b.runs.find((r) => r.runIndex === f.runIndex)!;
  const ref = b.runs.find((r) => r.runIndex === refIndex)!;
  const start = (r: RunResult) => Date.parse(r.steps[0]?.startedAt ?? r.startedAt);
  const total = (r: RunResult) => Math.max(1, Date.parse(r.finishedAt) - start(r));
  const span = Math.max(total(fail), total(ref));
  const runDir = (r: RunResult) => `${base}/run-${String(r.runIndex).padStart(2, "0")}`;
  const lane = (r: RunResult, other: RunResult, mark: boolean) => {
    const t0 = start(r);
    const blocks = r.steps.map((s, i) => {
      const from = Date.parse(s.startedAt) - t0;
      const end = i + 1 < r.steps.length ? Date.parse(r.steps[i + 1].startedAt) - t0 : total(r);
      const div = mark && f.divergenceStep !== null && s.index === f.divergenceStep;
      return `<i class="${kind(s)}${div ? " div" : ""}" style="left:${((from / span) * 100).toFixed(2)}%;width:${(Math.max(0, end - from) / span * 100).toFixed(2)}%" data-tip="${esc(`step ${s.index}: ${what(s)}`)}"></i>`;
    }).join("");
    const chips = r.steps.map((s) => {
      const o = other.steps[s.index];
      const same = o && o.name === s.name && JSON.stringify(o.input) === JSON.stringify(s.input);
      const div = mark && f.divergenceStep !== null && s.index >= f.divergenceStep;
      return `<span class="${div ? "div" : same ? "same" : ""}" title="step ${s.index}">${esc(what(s))}</span>`;
    }).join("");
    return `<div class="lane"><div class="who"><b>Run ${r.runIndex}</b>${r.steps.length} steps · ${secs(total(r))} from first action<br><span class="pill ${r.status}">${r.status}</span></div><div><div class="tl">${blocks}</div><div class="chips">${chips}</div></div></div>`;
  };
  const check = fail.checks.find((c) => !c.passed);
  const okCheck = ref.checks[0];
  return `<div class="trace">
    ${lane(ref, fail, false)}
    ${lane(fail, ref, true)}
    <div class="tracekey"><span><i style="background:var(--a)"></i>click</span><span><i style="background:#4a3aa7"></i>key</span><span><i style="background:#1baf7a"></i>type</span><span><i style="background:var(--ink-3)"></i>wait</span><span><i style="background:var(--line-2)"></i>look</span><span><i style="outline:2px solid var(--crit);outline-offset:-1px"></i>first divergent step${f.divergenceStep !== null ? ` (${f.divergenceStep})` : ""}</span></div>
  </div>
  <div class="said">
    <div><div class="cap">Run ${ref.runIndex} · final screen · the VM found</div><a href="${esc(runDir(ref))}/final.jpg" target="_blank"><img loading="lazy" src="${esc(runDir(ref))}/final.jpg" alt="final screenshot of run ${ref.runIndex}"></a><blockquote class="vm ok">${esc(okCheck?.detail ?? "all checks passed")}</blockquote></div>
    <div><div class="cap">Run ${fail.runIndex} · final screen · the agent said, and the VM found</div><a href="${esc(runDir(fail))}/final.jpg" target="_blank"><img loading="lazy" src="${esc(runDir(fail))}/final.jpg" alt="final screenshot of run ${fail.runIndex}"></a><blockquote class="agent">“${esc(fail.finalMessage ?? "")}”</blockquote><blockquote class="vm">${esc(check?.detail ?? "")}</blockquote></div>
  </div>
  <div class="hyp"><b>${esc(f.cause.replace(/_/g, " "))}</b> · ${esc(f.confidence)} confidence${f.divergenceStep !== null ? ` · diverges from run ${ref.runIndex} at step ${f.divergenceStep}` : ""}<div style="margin-top:4px">${esc(f.explanation)}</div></div>`;
}

/** The passing run exported with every screenshot, which is the one the divergence diff used. */
export function referenceRun(b: BenchResult): RunResult | undefined {
  return b.runs.filter((r) => r.status === "passed").sort((p, q) => q.steps.filter((s) => s.screenshot).length - p.steps.filter((s) => s.screenshot).length)[0];
}

/** Dots, but quieter: passes recede, failures stand out. Appended after the theme CSS. */
export const QUIET_DOTS_CSS = `
.dot{width:15px;height:15px;font-size:8px}
.dotrow{gap:5px}.dots{gap:5px}.dotrow em{width:20px;font-size:9px}
.dot.passed{background:var(--good-dim);color:var(--good-ink)}
.dot.failed{background:var(--crit);color:#fff}
`;
