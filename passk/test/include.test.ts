/**
 * Shared setup steps: `setup_from`. A proven line — the Chrome relaunch, say —
 * belongs in one file, and a task that includes it must end up with exactly
 * the steps it would have had if the line were pasted in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTask } from "../src/config.js";
import { taskHash } from "../src/provenance.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-include-"));
const write = (name: string, body: string): string => {
  const p = path.join(tmp, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};

const TASK = `
id: t
name: T
prompt: do the thing
checks:
  - type: file_exists
    path: /tmp/a
`;

test("an include's steps come first, with ${name} filled in from `with`", () => {
  write("shared/open.yaml", `- exec: sh\n  args: ["-c", "launch \${url}"]\n- wait: 2\n`);
  const file = write("a.yaml", `setup_from:\n  - file: shared/open.yaml\n    with: { url: "http://127.0.0.1:8080/box" }\nsetup:\n  - wait: 1\n${TASK}`);
  const task = loadTask(file);
  assert.deepEqual(task.setup, [
    { exec: "sh", args: ["-c", "launch http://127.0.0.1:8080/box"] },
    { wait: 2 },
    { wait: 1 },
  ]);
});

test("a task hashes the same whether its steps were pasted in or included", () => {
  write("shared/open.yaml", `- exec: sh\n  args: ["-c", "launch \${url}"]\n`);
  const included = loadTask(write("b.yaml", `setup_from:\n  file: shared/open.yaml\n  with: { url: "U" }\n${TASK}`));
  const pasted = loadTask(write("c.yaml", `setup:\n  - exec: sh\n    args: ["-c", "launch U"]\n${TASK}`));
  assert.equal(taskHash(included), taskHash(pasted));
});

test("a placeholder with no value is refused at load, not on a booted desktop", () => {
  write("shared/open.yaml", `- exec: sh\n  args: ["-c", "launch \${url}"]\n`);
  const file = write("d.yaml", `setup_from: shared/open.yaml\n${TASK}`);
  assert.throws(() => loadTask(file), /nothing supplies \$\{url\}/);
});

test("an include that is not a list of valid steps is refused", () => {
  write("shared/bad.yaml", `- run: ls\n`);
  assert.throws(() => loadTask(write("e.yaml", `setup_from: shared/bad.yaml\n${TASK}`)), /not a valid setup include/);
  write("shared/notalist.yaml", `hello: world\n`);
  assert.throws(() => loadTask(write("f.yaml", `setup_from: shared/notalist.yaml\n${TASK}`)), /not a setup include/);
});

test("the shipped bookmarx tasks all expand to the one Chrome line, each at its own URL", () => {
  const urls: Record<string, string> = {
    "bookmarx-box-lookup": "http://127.0.0.1:8080/box",
    "bookmarx-triage": "http://127.0.0.1:8080/box/triage",
    "bookmarx-lookup": "https://www.bookmarx.space/api/demo",
  };
  const lines = new Set<string>();
  for (const [id, url] of Object.entries(urls)) {
    const task = loadTask(`tasks/${id}.yaml`);
    const chrome = (task.setup ?? []).find((s) => "exec" in s && (s.args ?? []).some((a) => a.includes("remote-debugging-port")));
    assert.ok(chrome, `${id} should include the Chrome step`);
    const line = ("args" in chrome! ? chrome!.args ?? [] : [])[1] ?? "";
    assert.ok(line.includes(`'${url}'`), `${id} should open ${url}`);
    assert.ok(!line.includes("${"), "every placeholder is filled");
    lines.add(line.replace(url, "URL"));
  }
  assert.equal(lines.size, 1, "the same line, once, for every task that uses it");
});
