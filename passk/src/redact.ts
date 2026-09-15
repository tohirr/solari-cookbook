/**
 * Identifiers a task publishes under a label. A run's evidence can name real
 * things — a saved post's id, an account, an invoice number — that grade the
 * run honestly and must not leave with it. A task declares a guest file of
 * `{ identifier: label }` (`labels: /root/app/labels.json`); every run keeps
 * a copy beside its trace, never exported, and `export` rewrites the bench
 * and its evidence files so each identifier appears only as its label:
 * "target 6 (hateful)", "guard 5", "library post 212". The checks and their
 * details keep their meaning; the reader learns which labelled thing got
 * which decision and nothing else.
 *
 * Redaction is all or nothing: once a map is in play, an identifier-shaped
 * token that survives it fails the export, because a label file that misses
 * one post is the case this exists to catch.
 */
import fs from "node:fs";
import path from "node:path";
import type { BenchResult } from "./types.js";

/** Where a run keeps its label file, relative to the run directory. Never exported. */
export const LABELS_FILE = "labels.json";

export type Labels = Record<string, string>;

/** The union of every run's label file plus an operator-supplied one; later entries win. */
export function loadLabels(benchDir: string, runIndices: number[], extra?: string): Labels {
  const out: Labels = {};
  const take = (file: string) => {
    if (!fs.existsSync(file)) return;
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error(`${file} is not a labels file: expected an object of { identifier: label }`);
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) if (typeof v === "string" && k) out[k] = v;
  };
  for (const i of runIndices) take(path.join(benchDir, `run-${String(i).padStart(2, "0")}`, LABELS_FILE));
  if (extra) {
    if (!fs.existsSync(extra)) throw new Error(`--labels ${extra}: no such file`);
    take(extra);
  }
  return out;
}

/** Every identifier replaced by its label, longest identifiers first so one is never a prefix of another's match. */
export function redactText(text: string, labels: Labels): string {
  if (!text) return text;
  const ids = Object.keys(labels).sort((a, b) => b.length - a.length);
  let out = text;
  for (const id of ids) {
    if (!out.includes(id)) continue;
    // Not inside a word, and not the fraction of a float (a digit on the far side of the dot); a full stop after it is fine.
    const re = new RegExp(`(?<![A-Za-z0-9_])(?<!\\d\\.)${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])(?!\\.\\d)`, "g");
    out = out.replace(re, labels[id]);
  }
  return out;
}

/** Walk any JSON-shaped value, redacting every string. Keys are left alone: they are field names, not data. */
export function redactValue<T>(v: T, labels: Labels): T {
  if (typeof v === "string") return redactText(v, labels) as T;
  if (Array.isArray(v)) return v.map((x) => redactValue(x, labels)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactValue(x, labels)])) as T;
  return v;
}

/**
 * A JSON evidence file keyed by identifier — a decisions map, a click log —
 * has the identifiers as keys as well as values. Redact the text, so keys go
 * too; the file stays valid JSON because a label is a plain string.
 */
export function redactFileText(text: string, labels: Labels): string {
  return redactText(text, labels);
}

/**
 * Identifier-shaped tokens that survived: fifteen or more digits standing on
 * their own, the shape of a snowflake id. A float's fraction — a dot with a
 * digit on its far side, as in 0.09452865480086611 — is a score, not a post,
 * and is left alone; a full stop after an id is not a decimal point.
 */
export function unredacted(text: string): string[] {
  return [...new Set(text.match(/(?<![A-Za-z0-9_])(?<!\d\.)\d{15,}(?![A-Za-z0-9_])(?!\.\d)/g) ?? [])];
}

/** The bench with every string redacted, and a count for the record. */
export function redactBench(bench: BenchResult, labels: Labels): { bench: BenchResult; replaced: number } {
  const before = JSON.stringify(bench);
  const after = redactValue(bench, labels);
  const ids = Object.keys(labels);
  let replaced = 0;
  for (const id of ids) replaced += before.split(id).length - 1;
  return { bench: after, replaced };
}
