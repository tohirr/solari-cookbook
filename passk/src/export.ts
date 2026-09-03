/**
 * `passk export <runs/dir> <evidence/dir>` — copy a bench into a committed
 * evidence folder, keeping only the screenshots that carry proof: the final
 * frame of every run (that is the verified state), every frame of every
 * failed run (that is the diagnosis), and every frame of the shortest passing
 * run (that is what "right" looked like). Everything else is dropped, so the
 * folder stays small enough to live in git. bench.json and report.html are
 * rewritten to reference only what was copied.
 */
import fs from "node:fs";
import path from "node:path";
import { loadBench } from "./compare.js";
import { renderReport } from "./report/html.js";
import type { BenchResult } from "./types.js";

const runDir = (i: number) => `run-${String(i).padStart(2, "0")}`;

export function exportBench(srcDir: string, outDir: string): { bench: BenchResult; files: number; bytes: number } {
  const bench = loadBench(srcDir);
  fs.mkdirSync(outDir, { recursive: true });
  const shortestPass = bench.runs.filter((r) => r.status === "passed").sort((a, b) => a.steps.length - b.steps.length)[0];
  let files = 0, bytes = 0;
  const copy = (run: number, file: string) => {
    const from = path.join(srcDir, runDir(run), file);
    if (!fs.existsSync(from)) return false;
    const destDir = path.join(outDir, runDir(run));
    fs.mkdirSync(destDir, { recursive: true });
    // If a compressed copy already exists from an earlier export, keep it: JPEG
    // encoding is not byte-stable, and re-encoding every screenshot on every
    // refresh would churn megabytes of history for identical images.
    const jpg = path.join(destDir, file.replace(/\.png$/, ".jpg"));
    if (fs.existsSync(jpg)) { files++; return true; }
    fs.copyFileSync(from, path.join(destDir, file));
    files++; bytes += fs.statSync(from).size;
    return true;
  };
  for (const r of bench.runs) {
    const keepAll = r.status !== "passed" || r === shortestPass;
    if (r.finalScreenshot && !copy(r.runIndex, r.finalScreenshot)) r.finalScreenshot = undefined;
    for (const s of r.steps) {
      if (!s.screenshot) continue;
      if (!keepAll || !copy(r.runIndex, s.screenshot)) s.screenshot = undefined;
    }
    // Trim what a reviewer does not need per run: the raw base64 never lived here, but long inputs can.
    for (const s of r.steps) if (typeof (s.input as { text?: string })?.text === "string" && (s.input as { text: string }).text.length > 500) (s.input as { text: string }).text = (s.input as { text: string }).text.slice(0, 500) + "…";
  }
  fs.writeFileSync(path.join(outDir, "bench.json"), JSON.stringify(bench, null, 2));
  fs.writeFileSync(path.join(outDir, "report.html"), renderReport(bench));
  return { bench, files, bytes };
}
