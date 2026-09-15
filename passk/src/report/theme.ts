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

/**
 * The Google Fonts link for the serif; every page that uses CSS puts this in
 * its <head>. The stack falls back to the system's book serifs, so a page
 * without network still reads as paper.
 */
export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">`;

export const CSS = `
:root{
  --bg:#fbfaf7;--surface:#fbfaf7;--surface-2:#f1efe8;--line:#e3e0d7;--line-2:#c9c5b9;
  --ink:#1c1b18;--ink-2:#4f4c45;--ink-3:#6f6a5c;
  --good:#0ca30c;--good-ink:#006300;--good-dim:rgba(12,163,12,.14);
  --crit:#d03b3b;--crit-ink:#a52a2a;--crit-dim:rgba(208,59,59,.12);
  --warn:#9a6700;--warn-dim:rgba(154,103,0,.12);
  --a:#2a78d6;--a-dim:rgba(42,120,214,.14);--b:#d95926;--b-dim:rgba(217,89,38,.14);
  --serif:"Source Serif 4","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --radius:4px;--radius-s:3px;--measure:68ch;
}
*{box-sizing:border-box}
html{background:var(--bg);color-scheme:light}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 var(--serif);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:inherit;text-decoration-color:var(--line-2);text-underline-offset:2px}a:hover{text-decoration-color:var(--ink)}
main{max-width:920px;margin:0 auto;padding:52px 32px 96px}
h1{font:600 34px/1.15 var(--serif);letter-spacing:-.01em;margin:0 0 8px;max-width:var(--measure)}
h2{font:600 22px/1.25 var(--serif);margin:52px 0 14px;padding-top:14px;border-top:1px solid var(--line)}
h3{font:600 18px/1.3 var(--serif);margin:0 0 6px}
p{max-width:var(--measure)}
code{font:13.5px var(--mono);background:var(--surface-2);padding:1px 5px;border-radius:var(--radius-s);color:var(--ink-2)}
.brand{display:flex;align-items:center;gap:10px;font:13.5px var(--sans);color:var(--ink-3);margin-bottom:26px}
.brand b{color:var(--ink);font-weight:600}
.meta{font:14px var(--sans);color:var(--ink-3);margin-bottom:26px}.meta code{font-size:12.5px}
.prompt{border-left:2px solid var(--line-2);padding:4px 18px;margin:0 0 28px;color:var(--ink-2);font-style:italic;max-width:var(--measure)}
.verdict{font-size:21px;line-height:1.45;margin:0 0 34px;max-width:var(--measure)}
.verdict b{font-weight:600}
.card{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:14px 0 0}
table.checks{width:100%;border-collapse:collapse;font:14px var(--sans)}
table.checks th{text-align:left;color:var(--ink-3);font-weight:400;font-size:12.5px;padding:0 10px 6px 0;border-bottom:1px solid var(--line)}
table.checks td{padding:6px 10px 6px 0;border-top:1px solid var(--line);vertical-align:middle}
table.checks tr:first-child td{border-top:0}
table.checks td.num{font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink-2);font-family:var(--mono);font-size:13px}
table.checks tr.miss td:first-child{color:var(--ink);font-weight:600}
table.checks .bar{width:120px;height:5px;background:var(--surface-2);border-radius:2px;overflow:hidden}
table.checks .bar i{display:block;height:100%;background:var(--good);opacity:.8}
table.checks tr.miss .bar i{background:var(--crit);opacity:1}
.pill.inv{background:var(--surface-2);color:var(--ink-3)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 28px}
.kpi b{display:block;font:600 30px/1.05 var(--sans);letter-spacing:-.01em;margin-bottom:6px}
.kpi span{display:block;font:13px/1.4 var(--sans);color:var(--ink-3)}
.kpi .sub{color:var(--ink-2)}
.dots{display:grid;gap:6px}
.dotrow{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.dotrow em{width:26px;flex:none;font:11px var(--mono);font-style:normal;color:var(--ink-3);text-align:right;padding-right:2px}
.dot{width:20px;height:20px;border-radius:50%;border:0;display:inline-grid;place-items:center;font:700 11px/1 var(--mono);text-decoration:none}
a.dot{cursor:pointer}a.dot:hover{outline:2px solid var(--ink);outline-offset:1px}
.dot.passed{background:var(--good-dim);color:var(--good-ink)}
.dot.failed{background:var(--crit);color:#fff}
.dot.errored{background:transparent;box-shadow:inset 0 0 0 1.5px var(--ink-3);color:var(--ink-3)}
.dot.skipped{background:transparent;box-shadow:inset 0 0 0 1.5px var(--line-2)}
.headline{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.headline b{font:600 28px/1.05 var(--sans);letter-spacing:-.01em}
.headline span{font:13.5px var(--sans);color:var(--ink-2)}
.runrow{margin:0;border:0;border-top:1px solid var(--line);background:transparent}
.runrow>summary{list-style:none;display:flex;gap:14px;align-items:center;padding:10px 0;font:14px var(--sans);color:var(--ink-2);font-variant-numeric:tabular-nums;cursor:pointer}
.runrow>summary::-webkit-details-marker{display:none}
.runrow>summary b{color:var(--ink);font-weight:600;min-width:64px}
.runrow>summary .more{margin-left:auto;color:var(--ink-3);font-size:12.5px}
.runrow>.card{border:0;padding:6px 0 18px}
.runrow.attention>summary{cursor:default}
.diff{border-left:2px solid var(--line-2);padding:4px 18px;color:var(--ink-2);margin:0 0 24px;max-width:var(--measure);line-height:1.65}
.diff del{background:var(--crit-dim);color:var(--crit-ink);text-decoration:line-through;border-radius:2px;padding:0 2px}
.diff ins{background:var(--good-dim);color:var(--good-ink);text-decoration:none;border-radius:2px;padding:0 2px}
.checks .raw{color:var(--ink-3);font-size:11px;margin-left:6px;cursor:help}
.legend{display:flex;gap:16px;font:12.5px var(--sans);color:var(--ink-3);margin-top:10px;flex-wrap:wrap}
.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.range{position:relative;height:8px;background:var(--surface-2);border-radius:4px;margin:16px 0 6px}
.range i{position:absolute;top:0;bottom:0;border-radius:4px;background:var(--good);opacity:.22}
.range b{position:absolute;top:-5px;width:18px;height:18px;border-radius:50%;background:var(--good);border:2px solid var(--bg);transform:translateX(-50%)}
.range-labels{display:flex;justify-content:space-between;font:11.5px var(--mono);color:var(--ink-3)}
.strip{position:relative;height:44px;margin:6px 0 2px}
.strip .axis{position:absolute;left:0;right:0;top:22px;height:1px;background:var(--line-2)}
.strip .tick{position:absolute;top:28px;transform:translateX(-50%);font:11px var(--mono);color:var(--ink-3)}
.strip .pt{position:absolute;top:15px;width:14px;height:14px;border-radius:50%;transform:translateX(-50%);border:2px solid var(--bg);cursor:default}
.strip .pt.passed{background:var(--good)}.strip .pt.failed{background:var(--crit)}
.strip .pt.a{background:var(--a)}.strip .pt.b{background:var(--b)}
.strip .pt.hollow{background:var(--bg)!important;border:2.5px solid;box-shadow:inset 0 0 0 2px var(--bg)}.strip .pt.a.hollow{border-color:var(--a)}.strip .pt.b.hollow{border-color:var(--b)}
.strip .med{position:absolute;top:8px;width:2px;height:28px;background:var(--ink);transform:translateX(-50%)}
.strip .med.a{background:var(--a)}.strip .med.b{background:var(--b)}.strip .med.b:after{top:auto;bottom:-16px}
.strip .med:after{content:attr(data-label);position:absolute;top:-16px;left:50%;transform:translateX(-50%);font:10.5px var(--mono);color:var(--ink-2);white-space:nowrap}
.runs{display:grid;gap:18px}
.run{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:start}.run>div{min-width:0}
.run .id{font:13px var(--sans);color:var(--ink-3)}
.run .id b{display:block;font:600 16px var(--sans);color:var(--ink);margin-bottom:4px}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font:600 12px/1.5 var(--sans);background:var(--surface-2);color:var(--ink-2);vertical-align:middle;white-space:nowrap}
.pill.passed{background:var(--good-dim);color:var(--good-ink)}.pill.failed{background:var(--crit-dim);color:var(--crit-ink)}.pill.errored{background:var(--surface-2);color:var(--ink-2)}
.pill.a,.pill.b{color:var(--ink)}.pill.a{background:var(--a-dim)}.pill.b{background:var(--b-dim)}
.pill.a::before,.pill.b::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:0}
.pill.a::before{background:var(--a)}.pill.b::before{background:var(--b)}
.pill.neutral{background:var(--surface-2);color:var(--ink-2)}
.checks{display:flex;flex-direction:column;gap:3px;font:12.5px var(--mono);color:var(--ink-2)}
.checks .ok{color:var(--good-ink)}.checks .bad{color:var(--crit-ink)}
.checks .detail{color:var(--ink-3);white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto}
.film{display:flex;gap:6px;overflow-x:auto;padding:10px 0 4px;scrollbar-width:thin}
.film a{flex:none;position:relative}
.film img{height:84px;border-radius:var(--radius-s);border:1px solid var(--line);display:block;background:#000}
.film a.final img{border-color:var(--good)}.film a.diverge img{border-color:var(--warn);box-shadow:0 0 0 2px var(--warn)}
.film em{position:absolute;left:4px;bottom:4px;font:10px var(--mono);font-style:normal;background:rgba(0,0,0,.65);color:#fff;padding:1px 5px;border-radius:3px}
.acts{font:12.5px var(--sans);color:var(--ink-3);margin:6px 0 4px;font-variant-numeric:tabular-nums}
.hyp{overflow-wrap:anywhere;margin-top:12px;padding:6px 16px;border-left:2px solid var(--line-2);font-size:15px;line-height:1.55;color:var(--ink-2);max-width:var(--measure)}
.hyp b{color:var(--ink);font-weight:600}
details{margin-top:8px}summary{cursor:pointer;font:13px var(--sans);color:var(--ink-3)}
pre{white-space:pre-wrap;font:12.5px/1.5 var(--mono);color:var(--ink-2);margin:8px 0 0;background:var(--surface-2);padding:10px 12px;border-radius:var(--radius);overflow:auto}
.foot{font:13.5px/1.55 var(--sans);color:var(--ink-3);margin-top:60px;border-top:1px solid var(--line);padding-top:16px}
.foot code{font-size:12px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px 32px}
@media(max-width:760px){.two{grid-template-columns:1fr}.run{grid-template-columns:1fr}main{padding:36px 20px 72px}body{font-size:16px}}
table{width:100%;border-collapse:collapse;font:14px var(--sans);font-variant-numeric:tabular-nums}
th,td{padding:9px 10px 9px 0;text-align:left;border-top:1px solid var(--line);vertical-align:top}th{color:var(--ink-3);font-weight:400;border-top:0;border-bottom:1px solid var(--line);font-size:12.5px}
td.num,th.num{text-align:right;font-family:var(--mono);font-size:13px}
.delta.up{color:var(--good-ink)}.delta.down{color:var(--crit-ink)}.delta.flat{color:var(--ink-3)}
.note{font:13.5px/1.5 var(--sans);color:var(--ink-3);margin-top:8px;max-width:var(--measure)}
.tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);font:12px var(--mono);padding:5px 8px;border-radius:4px;transform:translate(-50%,-130%);opacity:0;transition:opacity .08s;white-space:nowrap;z-index:9}
@media print{main{max-width:none;padding:0}body{font-size:11pt}a{text-decoration:none}.film{display:none}details{display:none}}
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
