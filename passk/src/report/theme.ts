/**
 * Shared look for passk reports. One dark surface, text in ink tokens, colour
 * reserved for outcome (good / critical / neutral) and, on the comparison page,
 * for telling condition A from condition B. Everything is a CSS custom
 * property so the whole look can be re-skinned from the :root block.
 */
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const secs = (ms: number) => `${Math.round(ms / 1000)}s`;
export const usd = (x: number | null | undefined, digits = 3) => (x === null || x === undefined ? "—" : `$${x.toFixed(digits)}`);

export const CSS = `
:root{
  --bg:#0e0f12;--surface:#15171c;--surface-2:#1b1e25;--line:#262a33;--line-2:#333845;
  --ink:#eceef2;--ink-2:#a3a9b7;--ink-3:#6b7180;
  --good:#22c55e;--good-dim:rgba(34,197,94,.22);--crit:#e5484d;--crit-dim:rgba(229,72,77,.22);--warn:#f5a524;
  --a:#3987e5;--a-dim:rgba(57,135,229,.22);--b:#eb6834;--b-dim:rgba(235,104,52,.22);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  --radius:14px;--radius-s:8px;
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
main{max-width:1120px;margin:0 auto;padding:48px 28px 80px}
h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:0 0 6px;font-weight:650}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin:40px 0 14px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:22px}
.brand b{color:var(--ink);font-weight:700;letter-spacing:0;text-transform:none;font-size:13px}
.meta{color:var(--ink-3);font-size:13px;margin-bottom:22px}.meta code{font-family:var(--mono);font-size:12px;color:var(--ink-2)}
.prompt{border-left:3px solid var(--line-2);padding:6px 14px;color:var(--ink-2);margin:0 0 26px;font-size:15px;max-width:820px}
.verdict{font-size:20px;line-height:1.35;letter-spacing:-.01em;margin:0 0 26px;max-width:820px}
.verdict b{font-weight:650}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.kpi b{display:block;font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin-bottom:6px;font-variant-numeric:tabular-nums}
.kpi span{color:var(--ink-3);font-size:12px;display:block}
.kpi .sub{color:var(--ink-2)}
.dots{display:grid;gap:6px}
.dotrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dotrow em{width:26px;flex:none;font:10px var(--mono);font-style:normal;color:var(--ink-3);text-align:right;padding-right:2px}
.dot{width:22px;height:22px;border-radius:50%;border:2px solid transparent;display:inline-grid;place-items:center;font-size:11px;font-weight:700;color:var(--bg);font-family:var(--mono);text-decoration:none;line-height:1}
a.dot{cursor:pointer}a.dot:hover{outline:2px solid var(--ink-2);outline-offset:1px}
.dot.passed{background:var(--good)}.dot.failed{background:var(--crit)}.dot.errored{background:transparent;border-color:var(--ink-3);color:var(--ink-3)}
.dot.skipped{background:transparent;border-color:var(--line-2);color:var(--ink-3)}
.headline{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.headline b{font-size:26px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.headline span{color:var(--ink-2);font-size:13px}
.runrow{margin:0;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
.runrow>summary{list-style:none;display:flex;gap:14px;align-items:center;padding:10px 20px;font-size:13px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.runrow>summary::-webkit-details-marker{display:none}
.runrow>summary b{color:var(--ink);font-weight:600;min-width:64px}
.runrow>summary .more{margin-left:auto;color:var(--ink-3);font-size:12px}
.runrow[open]>summary{border-bottom:1px solid var(--line)}
.runrow>.card{border:0;border-radius:0 0 var(--radius) var(--radius)}
.runrow.attention>summary{cursor:default}
.diff{border-left:3px solid var(--line-2);padding:6px 14px;color:var(--ink-2);margin:0 0 22px;font-size:15px;max-width:820px;line-height:1.6}
.diff del{background:var(--crit-dim);color:var(--crit);text-decoration:line-through;border-radius:3px;padding:0 2px}
.diff ins{background:var(--good-dim);color:var(--good);text-decoration:none;border-radius:3px;padding:0 2px}
.checks .raw{color:var(--ink-3);font-size:11px;margin-left:6px;cursor:help}
.legend{display:flex;gap:16px;color:var(--ink-3);font-size:12px;margin-top:10px;flex-wrap:wrap}
.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.range{position:relative;height:10px;background:var(--surface-2);border-radius:5px;margin:14px 0 6px}
.range i{position:absolute;top:0;bottom:0;border-radius:5px;background:var(--good-dim)}
.range b{position:absolute;top:-4px;width:18px;height:18px;border-radius:50%;background:var(--good);border:3px solid var(--surface);transform:translateX(-50%)}
.range-labels{display:flex;justify-content:space-between;color:var(--ink-3);font-size:11px;font-family:var(--mono)}
.strip{position:relative;height:44px;margin:6px 0 2px}
.strip .axis{position:absolute;left:0;right:0;top:22px;height:1px;background:var(--line-2)}
.strip .tick{position:absolute;top:28px;transform:translateX(-50%);color:var(--ink-3);font-size:11px;font-family:var(--mono)}
.strip .pt{position:absolute;top:14px;width:16px;height:16px;border-radius:50%;transform:translateX(-50%);border:2px solid var(--surface);cursor:default}
.strip .pt.passed{background:var(--good)}.strip .pt.failed{background:var(--crit)}
.strip .pt.a{background:var(--a)}.strip .pt.b{background:var(--b)}
.strip .pt.hollow{background:transparent!important;border:2.5px solid;box-shadow:inset 0 0 0 2px var(--surface)}.strip .pt.a.hollow{border-color:var(--a)}.strip .pt.b.hollow{border-color:var(--b)}
.strip .med{position:absolute;top:8px;width:2px;height:28px;background:var(--ink);opacity:.7;transform:translateX(-50%)}
.strip .med.a{background:var(--a);opacity:1}.strip .med.b{background:var(--b);opacity:1}.strip .med.b:after{top:auto;bottom:-16px}
.strip .med:after{content:attr(data-label);position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--ink-2);font-family:var(--mono);white-space:nowrap}
.runs{display:grid;gap:12px}
.run{display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:start}.run>div{min-width:0}
.run .id{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.run .id b{display:block;font-size:15px;color:var(--ink);font-family:var(--sans);font-weight:600;margin-bottom:2px}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.02em}
.pill.passed{background:var(--good-dim);color:var(--good)}.pill.failed{background:var(--crit-dim);color:var(--crit)}.pill.errored{background:var(--surface-2);color:var(--ink-2)}
.pill.a{background:var(--a-dim);color:var(--a)}.pill.b{background:var(--b-dim);color:var(--b)}
.pill.neutral{background:var(--surface-2);color:var(--ink-2)}
.checks{display:flex;flex-direction:column;gap:3px;font-size:12px;font-family:var(--mono);color:var(--ink-2)}
.checks .ok{color:var(--good)}.checks .bad{color:var(--crit)}
.checks .detail{color:var(--ink-3);white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto}
.film{display:flex;gap:6px;overflow-x:auto;padding:10px 0 4px;scrollbar-width:thin}
.film a{flex:none;position:relative}
.film img{height:84px;border-radius:6px;border:1px solid var(--line);display:block;background:#000}
.film a.final img{border-color:var(--good)}.film a.diverge img{border-color:var(--warn);box-shadow:0 0 0 2px var(--warn)}
.film em{position:absolute;left:4px;bottom:4px;font:10px var(--mono);font-style:normal;background:rgba(0,0,0,.65);color:#fff;padding:1px 5px;border-radius:4px}
.hyp{overflow-wrap:anywhere;margin-top:10px;padding:10px 12px;background:var(--surface-2);border-radius:var(--radius-s);font-size:13px;color:var(--ink-2)}
.hyp b{color:var(--ink);font-weight:600}
details{margin-top:8px}summary{cursor:pointer;color:var(--ink-3);font-size:12px}
pre{white-space:pre-wrap;font:12px/1.5 var(--mono);color:var(--ink-2);margin:8px 0 0}
.foot{color:var(--ink-3);font-size:12px;margin-top:40px;border-top:1px solid var(--line);padding-top:16px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.two{grid-template-columns:1fr}.run{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:9px 10px;text-align:left;border-top:1px solid var(--line);vertical-align:top;font-size:13px}th{color:var(--ink-3);font-weight:500;border-top:0;font-size:12px}
td.num,th.num{text-align:right;font-family:var(--mono);font-size:12.5px}
.delta.up{color:var(--good)}.delta.down{color:var(--crit)}.delta.flat{color:var(--ink-3)}
.note{color:var(--ink-3);font-size:12.5px;margin-top:8px}
.tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);font:12px var(--mono);padding:5px 8px;border-radius:6px;transform:translate(-50%,-130%);opacity:0;transition:opacity .08s;white-space:nowrap;z-index:9}
`;

/** Tiny hover tooltip: any element with data-tip shows it. */
export const TIP_JS = `
<div class="tip" id="tip"></div>
<script>
(function(){var t=document.getElementById('tip');document.addEventListener('mousemove',function(e){var el=e.target.closest&&e.target.closest('[data-tip]');if(!el){t.style.opacity=0;return;}t.textContent=el.getAttribute('data-tip');t.style.left=e.clientX+'px';t.style.top=e.clientY+'px';t.style.opacity=1;});})();
</script>`;

/** Position (0..1) of a value on a shared axis. */
export function scale(min: number, max: number) {
  const span = Math.max(1, max - min);
  return (v: number) => ((v - min) / span) * 100;
}

/**
 * Outcome dots, one per run. Pass and fail are told apart by glyph as well as
 * colour; lost runs carry a letter for what lost them. Past ten runs the dots
 * wrap into rows of ten with the row's first index in the margin, so a
 * failure at run 27 is found by eye. With `href`, every dot links to its run.
 */
export function dotsHtml(runs: { status: string; runIndex: number; steps: number; errorKind?: string; stoppedBy?: string }[], skipped = 0, cls = "", href?: (runIndex: number) => string): string {
  const glyph: Record<string, string> = { passed: "✓", failed: "×", solari: "!", provider: "M", verifier: "?", agent: "×" };
  const dots = runs.map((r) => {
    const lost = r.status === "errored" ? (r.errorKind ?? (r.steps === 0 ? "solari" : "agent")) : null;
    const tip = lost ? `run ${r.runIndex}: lost to ${lost === "solari" ? "desktop infrastructure" : lost === "provider" ? "the model provider" : lost === "verifier" ? "a checker crash" : "an agent error"}`
      : `run ${r.runIndex}: ${r.status} in ${r.steps} steps${r.stoppedBy === "safety_check" ? " (stopped on a safety check)" : ""}`;
    const g = lost ? glyph[lost] ?? "!" : glyph[r.status] ?? "";
    const attrs = `class="dot ${r.status} ${cls}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"`;
    return href ? `<a ${attrs} href="${esc(href(r.runIndex))}">${g}</a>` : `<span ${attrs}>${g}</span>`;
  });
  for (let i = 0; i < skipped; i++) dots.push(`<span class="dot skipped" data-tip="skipped: budget reached" aria-label="skipped: budget reached"></span>`);
  if (dots.length <= 10) return `<div class="dots"><div class="dotrow">${dots.join("")}</div></div>`;
  const rows: string[] = [];
  for (let i = 0; i < dots.length; i += 10) rows.push(`<div class="dotrow"><em>${i}</em>${dots.slice(i, i + 10).join("")}</div>`);
  return `<div class="dots">${rows.join("")}</div>`;
}

/**
 * Which tail statistic a sample can honestly carry. A p95 of five runs is the
 * maximum wearing a costume; below ten runs show the range, below twenty a
 * p90, and a p95 only from twenty on.
 */
export function tailStat(n: number): { label: string; p: number } | null {
  if (n < 10) return null;
  return n < 20 ? { label: "p90", p: 0.9 } : { label: "p95", p: 0.95 };
}

/** Word-level diff of two short texts as HTML with <del> and <ins>, so "one thing changed" is visible rather than asserted. */
export function wordDiffHtml(a: string, b: string): string {
  const A = a.trim().split(/\s+/), B = b.trim().split(/\s+/);
  const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: string[] = [];
  let i = 0, j = 0, del: string[] = [], ins: string[] = [];
  const flush = () => {
    if (del.length) out.push(`<del>${esc(del.join(" "))}</del>`);
    if (ins.length) out.push(`<ins>${esc(ins.join(" "))}</ins>`);
    del = []; ins = [];
  };
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { flush(); out.push(esc(A[i])); i++; j++; }
    else if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) ins.push(B[j++]);
    else del.push(A[i++]);
  }
  flush();
  return out.join(" ");
}

/** Runs as points on a shared numeric axis (steps or seconds), with a median marker. */
export function stripHtml(points: { v: number; cls: string; tip: string }[], median: number | { a: number; b: number }, min: number, max: number, unit: string): string {
  const x = scale(min, max);
  const ticks = [min, Math.round((min + max) / 2), max];
  const medians = typeof median === "number"
    ? `<span class="med" style="left:${x(median)}%" data-label="median ${median}${unit}"></span>`
    : `<span class="med a" style="left:${x(median.a)}%" data-label="A ${median.a}${unit}"></span><span class="med b" style="left:${x(median.b)}%" data-label="B ${median.b}${unit}"></span>`;
  return `<div class="strip" style="${typeof median === "number" ? "" : "height:56px"}">
    <div class="axis"></div>
    ${ticks.map((t) => `<span class="tick" style="left:${x(t)}%">${t}${unit}</span>`).join("")}
    ${medians}
    ${points.map((p) => `<span class="pt ${p.cls}" style="left:${x(p.v)}%" data-tip="${esc(p.tip)}"></span>`).join("")}
  </div>`;
}
