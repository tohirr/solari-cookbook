/**
 * Task-declared evidence: files copied out of every fork after grading.
 *
 * A check answers yes or no. "The hateful target is still present" says which
 * rule broke, not what the agent decided: which row got Keep, in what order,
 * in this run. That lives in the app's own state inside the VM, and the VM is
 * killed the moment the run ends. A task names the files that explain its
 * verdicts (`evidence: [/root/app/state.json]`) and every run keeps a copy
 * next to its screenshots and its trace.
 *
 * Collected after the checks so the bytes are the ones that were graded, and
 * best-effort throughout: a missing or unreadable file is recorded on the run
 * and never turns a graded outcome into an error.
 */
import fs from "node:fs";
import path from "node:path";
import type { Desktop } from "@solarisdk/sdk";
import { withReconnect } from "./desktop.js";
import { LABELS_FILE } from "./redact.js";
import type { EvidenceFile } from "./types.js";

/** Where a run keeps the files its task declared, relative to the run directory. */
export const EVIDENCE_DIR = "evidence";

/** Anything larger is recorded and skipped. A run directory is a diagnosis, not a backup of the VM. */
export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

/** A guest path becomes a filename; two paths with the same basename keep their full path, flattened. */
function fileNames(paths: string[]): string[] {
  const base = paths.map((p) => (p.split("/").filter(Boolean).pop() ?? "file").replace(/[^A-Za-z0-9._-]/g, "_"));
  return paths.map((p, i) =>
    base.filter((b) => b === base[i]).length > 1 ? p.replace(/^\//, "").replace(/[^A-Za-z0-9._-]/g, "_") : base[i]);
}

async function sizeOf(desktop: Desktop, p: string): Promise<number | null> {
  try {
    const st = (await withReconnect(desktop, () => desktop.fs.stat(p))) as { size?: number };
    return typeof st.size === "number" ? st.size : null;
  } catch {
    return null; // no stat is not a verdict; the read below decides
  }
}

export async function collectEvidence(desktop: Desktop, paths: string[] | undefined, outDir: string): Promise<EvidenceFile[]> {
  if (!paths?.length) return [];
  const names = fileNames(paths);
  const out: EvidenceFile[] = [];
  for (const [i, p] of paths.entries()) {
    try {
      const size = await sizeOf(desktop, p);
      if (size !== null && size > MAX_EVIDENCE_BYTES) {
        out.push({ path: p, error: `${(size / 1e6).toFixed(1)} MB is over the ${MAX_EVIDENCE_BYTES / 1e6} MB evidence cap; not copied` });
        continue;
      }
      const data = await withReconnect(desktop, () => desktop.fs.read(p));
      if (data.byteLength > MAX_EVIDENCE_BYTES) {
        out.push({ path: p, error: `${(data.byteLength / 1e6).toFixed(1)} MB is over the ${MAX_EVIDENCE_BYTES / 1e6} MB evidence cap; not copied` });
        continue;
      }
      fs.mkdirSync(path.join(outDir, EVIDENCE_DIR), { recursive: true });
      fs.writeFileSync(path.join(outDir, EVIDENCE_DIR, names[i]), data);
      out.push({ path: p, file: `${EVIDENCE_DIR}/${names[i]}`, bytes: data.byteLength });
    } catch (err) {
      out.push({ path: p, error: (err as Error).message });
    }
  }
  return out;
}

/** Bytes as a reader wants them: "812 B", "12 KB", "1.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** "state.json 12 KB · /root/app/server.log ✗ ENOENT" — one line for the run log. */
export function evidenceSummary(files: EvidenceFile[]): string {
  return files.map((f) => (f.file ? `${path.basename(f.file)} ${fileSize(f.bytes ?? 0)}` : `${f.path} ✗ ${f.error ?? "not copied"}`)).join(" · ");
}

/**
 * The task's label file, kept at the run directory's root rather than under
 * evidence/, so nothing that copies evidence carries it along. Same
 * best-effort rules as evidence: a missing file is recorded, never raised.
 */
export async function collectLabels(desktop: Desktop, guestPath: string | undefined, outDir: string): Promise<EvidenceFile | undefined> {
  if (!guestPath) return undefined;
  try {
    const data = await withReconnect(desktop, () => desktop.fs.read(guestPath));
    if (data.byteLength > MAX_EVIDENCE_BYTES) return { path: guestPath, error: `${(data.byteLength / 1e6).toFixed(1)} MB is over the ${MAX_EVIDENCE_BYTES / 1e6} MB cap; not copied` };
    JSON.parse(new TextDecoder().decode(data)); // must be JSON now, not at export
    fs.writeFileSync(path.join(outDir, LABELS_FILE), data);
    return { path: guestPath, file: LABELS_FILE, bytes: data.byteLength };
  } catch (err) {
    return { path: guestPath, error: (err as Error).message };
  }
}
