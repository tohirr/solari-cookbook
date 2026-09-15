/**
 * `passk export <runs/dir> <evidence/dir>` — copy a bench into a committed
 * evidence folder, keeping only the screenshots that carry proof: the final
 * frame of every run (that is the verified state), every frame of every
 * failed run (that is the diagnosis), and every frame of the shortest passing
 * run (that is what "right" looked like). Everything else is dropped, so the
 * folder stays small enough to live in git. Task-declared evidence files are
 * kept for every run: they are capped at 2 MB when collected, and they are the
 * only record of what the app inside the VM actually ended up holding.
 * bench.json and report.html are rewritten to reference only what was copied.
 *
 * A task that declares `screenshots: private` keeps every frame in `runs/`:
 * none is copied and the exported report shows none, because the screens
 * carry content that must not be published. Its checks, its numbers and its
 * task-declared evidence files are exported as usual.
 */
import fs from "node:fs";
import path from "node:path";
import { loadBench } from "./compare.js";
import { renderReport } from "./report/html.js";
import type { BenchResult } from "./types.js";

const runDir = (i: number) => `run-${String(i).padStart(2, "0")}`;

export function exportBench(srcDir: string, outDir: string): { bench: BenchResult; files: number; evidence: number; bytes: number; privateShots: boolean } {
  const bench = loadBench(srcDir);
  const privateShots = bench.provenance?.task?.screenshots === "private";
  fs.mkdirSync(outDir, { recursive: true });
  const shortestPass = bench.runs.filter((r) => r.status === "passed").sort((a, b) => a.steps.length - b.steps.length)[0];
  let files = 0, evidence = 0, bytes = 0;
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
    if (privateShots) {
      // Not copied, and not referenced: an exported report must never point at a frame it was not allowed to carry.
      r.finalScreenshot = undefined;
      for (const s of r.steps) s.screenshot = undefined;
    } else {
      if (r.finalScreenshot && !copy(r.runIndex, r.finalScreenshot)) r.finalScreenshot = undefined;
      for (const s of r.steps) {
        if (!s.screenshot) continue;
        if (!keepAll || !copy(r.runIndex, s.screenshot)) s.screenshot = undefined;
      }
    }
    for (const e of r.evidence ?? []) {
      if (!e.file) continue;
      const from = path.join(srcDir, runDir(r.runIndex), e.file);
      if (!fs.existsSync(from)) { e.error = `${e.file} was not in the source bench`; e.file = undefined; continue; }
      const to = path.join(outDir, runDir(r.runIndex), e.file);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      evidence++; bytes += fs.statSync(from).size;
    }
    // Trim what a reviewer does not need per run: the raw base64 never lived here, but long inputs can.
    for (const s of r.steps) if (typeof (s.input as { text?: string })?.text === "string" && (s.input as { text: string }).text.length > 500) (s.input as { text: string }).text = (s.input as { text: string }).text.slice(0, 500) + "…";
  }
  fs.writeFileSync(path.join(outDir, "bench.json"), JSON.stringify(bench, null, 2));
  fs.writeFileSync(path.join(outDir, "report.html"), renderReport(bench));
  return { bench, files, evidence, bytes, privateShots };
}
