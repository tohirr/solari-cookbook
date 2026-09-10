/**
 * Render the two still images in docs/ that are not screenshots of a report:
 * the failure-evidence panel and the how-it-works diagram. Both are drawn
 * from the same code and bench files as the showcase, so they cannot say
 * anything the evidence does not, and they regenerate with it.
 *
 *   npm run assets          writes runs/assets/*.html, then shoots them with
 *                           headless Chrome and converts to JPEG with sips
 *                           (macOS). Without Chrome the HTML is still written.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CSS, esc, pct } from "../src/report/theme.js";
import { CHART_CSS, referenceRun, traceCompare } from "../src/report/charts.js";
import type { BenchResult } from "../src/types.js";

const EV = path.resolve("evidence");
const OUT = path.resolve("runs/assets");
fs.mkdirSync(OUT, { recursive: true });
const bench = (name: string) => JSON.parse(fs.readFileSync(path.join(EV, name, "bench.json"), "utf8")) as BenchResult;

const page = (title: string, body: string, extra = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}${CHART_CSS}${extra}
main{padding:40px 40px 32px}
</style></head><body><main>${body}</main></body></html>`;

// 1. Failure evidence: a passing run and a failing sibling on one time axis,
//    the first divergent step, the agent's claim, and what the checker found.
const base = bench("ticket-queue-baseline");
const featured = base.failures.find((f) => f.divergenceStep !== null) ?? base.failures[0];
const ref = referenceRun(base)!;
const m = base.metrics;
const failure = page("passk · where a failure diverges", `
<div class="brand"><b>passk</b> failure evidence · ${esc(base.taskName)} · ${m.passed}/${m.n} passed</div>
<h1 style="font-size:26px">Same snapshot, same prompt, same model. Run ${ref.runIndex} passed; run ${featured.runIndex} said it did.</h1>
<p style="margin:0 0 18px;color:var(--ink-2);font-size:14px;max-width:900px">Every run forks the same desktop. The lanes are the two runs' actions on one time axis; the outlined step is where they first part ways. Under the final screens: what the agent reported, and what the checker read from the app's own state file inside the VM.</p>
<div class="card">${traceCompare(base, featured, ref.runIndex, `file://${path.join(EV, "ticket-queue-baseline")}`)}</div>
`, `.said img{max-height:300px;object-fit:cover;object-position:top}`);
fs.writeFileSync(path.join(OUT, "failure-ticket-queue.html"), failure);

// 2. How it works: the pipeline, with the verifier proven before the forks.
//    Boxes are positioned; the lines are one SVG underneath, so every connector lands.
type B = { id: string; x: number; y: number; w: number; h: number; t: string; sub: string; cls?: string };
const L = 30, LW = 300, RW = 130, GAP = 40, RH = 64;
const rowY = [90, 182, 274];
const boxes: B[] = [
  { id: "task", x: L, y: 56, w: LW, h: 60, t: "task + verifier", sub: "prompt, setup, golden steps, checks" },
  { id: "prep", x: L, y: 136, w: LW, h: 60, t: "prepare one Solari desktop", sub: "boot the template, run setup once" },
  { id: "snap", x: L, y: 216, w: LW, h: 60, t: "snapshot", sub: "every fork starts from exactly here", cls: "snap" },
  { id: "val", x: L, y: 296, w: LW, h: 74, t: "validate the verifier", sub: "checks fail untouched and pass after the golden steps, or no bench", cls: "val" },
  ...rowY.flatMap((y, i) => [
    { id: `f${i}`, x: 420, y, w: RW, h: RH, t: `fork ${i + 1}`, sub: "byte-identical desktop", cls: "fk" },
    { id: `a${i}`, x: 420 + RW + GAP, y, w: RW, h: RH, t: "agent", sub: "same prompt, same model" },
    { id: `c${i}`, x: 420 + 2 * (RW + GAP), y, w: RW, h: RH, t: "checks", sub: "state read inside the VM", cls: "ck" },
  ]),
  { id: "rep", x: 900, y: 130, w: 300, h: 156, t: "reliability report", sub: "pass@1 with its interval · pass^k · effort and cost per success · lost runs never blamed on the agent · every failure diffed against a passing run", cls: "rep" },
];
const by = Object.fromEntries(boxes.map((b) => [b.id, b]));
const cx = (b: B) => b.x + b.w / 2, cy = (b: B) => b.y + b.h / 2;
const seg = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1} L${x2} ${y2}"/>`;
const spineL = 385, spineR = 870;
const lines = [
  seg(cx(by.task), by.task.y + by.task.h, cx(by.prep), by.prep.y),
  seg(cx(by.prep), by.prep.y + by.prep.h, cx(by.snap), by.snap.y),
  seg(cx(by.snap), by.snap.y + by.snap.h, cx(by.val), by.val.y),
  // the validated snapshot feeds the fan-out: right from the snapshot box, up the spine, into each fork
  seg(by.snap.x + by.snap.w, cy(by.snap), spineL, cy(by.snap)),
  seg(spineL, cy(by.f0), spineL, cy(by.f2)),
  ...rowY.map((_, i) => seg(spineL, cy(by[`f${i}`]), by[`f${i}`].x, cy(by[`f${i}`]))),
  ...rowY.flatMap((_, i) => [seg(by[`f${i}`].x + RW, cy(by[`f${i}`]), by[`a${i}`].x, cy(by[`a${i}`])), seg(by[`a${i}`].x + RW, cy(by[`a${i}`]), by[`c${i}`].x, cy(by[`c${i}`]))]),
  ...rowY.map((_, i) => seg(by[`c${i}`].x + RW, cy(by[`c${i}`]), spineR, cy(by[`c${i}`]))),
  seg(spineR, cy(by.c0), spineR, cy(by.c2)),
  seg(spineR, cy(by.rep), by.rep.x, cy(by.rep)),
].join("");
const arrows = [[cx(by.task), by.prep.y], [cx(by.prep), by.snap.y], [cx(by.snap), by.val.y], ...rowY.map((_, i) => [by[`f${i}`].x, cy(by[`f${i}`])]), [by.rep.x, cy(by.rep)]]
  .map(([x, y], i) => i < 3 ? `<path d="M${x - 5} ${y - 7} L${x} ${y} L${x + 5} ${y - 7}"/>` : `<path d="M${x - 7} ${y - 5} L${x} ${y} L${x - 7} ${y + 5}"/>`).join("");
const howItWorks = page("passk · how it works", `
<div class="brand"><b>passk</b> how it works</div>
<h1 style="font-size:26px;margin-bottom:0">One prepared desktop, forked <i>k</i> times. The verifier is proven before the agent runs.</h1>
<div class="canvas">
  <svg width="1200" height="400" viewBox="0 0 1200 400" fill="none" stroke="var(--line-2)" stroke-width="2">${lines}${arrows}</svg>
  ${boxes.map((b) => `<div class="box ${b.cls ?? ""}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"><b>${b.t}</b><span>${b.sub}</span></div>`).join("")}
  <div class="more" style="left:420px;top:${rowY[2] + RH + 8}px;width:${3 * RW + 2 * GAP}px">⋯ fork <i>k</i>, each booted from the snapshot in about a second</div>
</div>
<div style="color:var(--ink-3);font-size:12.5px">Nothing the agent says about its own success counts. A run passes only if every check passes when evaluated inside its desktop after the agent stops. A fork that never booted is a lost run, listed and not scored.</div>
`, `
main{max-width:1280px}
.canvas{position:relative;width:1200px;height:400px;margin:0 0 4px}
.canvas svg{position:absolute;left:0;top:0}
.box{position:absolute;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-s);padding:9px 12px;display:flex;flex-direction:column;justify-content:center}
.box b{display:block;font-size:14px;font-weight:600;letter-spacing:-.01em;line-height:1.2}
.box span{display:block;color:var(--ink-2);font-size:11.5px;margin-top:2px;line-height:1.3}
.box.snap{border-color:var(--a);box-shadow:0 0 0 3px var(--a-dim)}
.box.val{border-color:var(--good);box-shadow:0 0 0 3px var(--good-dim)}
.box.fk{border-color:var(--a)}.box.ck{border-color:var(--good)}
.box.rep{padding:14px 16px}.box.rep b{font-size:16px}.box.rep span{font-size:12.5px;margin-top:6px;line-height:1.4}
.more{position:absolute;text-align:center;color:var(--ink-3);font-size:12.5px}
`);
fs.writeFileSync(path.join(OUT, "how-it-works.html"), howItWorks);

// 3. Shoot them. Chrome and sips are macOS conveniences; the HTML is the artifact if they are missing.
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots: [string, string, number][] = [["failure-ticket-queue", "docs/failure-ticket-queue.jpg", 1000], ["how-it-works", "docs/how-it-works.jpg", 560]];
if (fs.existsSync(chrome)) {
  for (const [name, dest, height] of shots) {
    const png = path.join(OUT, `${name}.png`);
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=1280,${height}`, `--screenshot=${png}`, `file://${path.join(OUT, `${name}.html`)}`], { stdio: "ignore" });
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "70", png, "--out", dest], { stdio: "ignore" });
    console.log(`${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
  }
} else {
  console.log(`no Chrome at ${chrome}; HTML written to ${OUT}`);
}
