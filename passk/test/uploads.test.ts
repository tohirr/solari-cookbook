/**
 * A task that uploads a file it does not have is refused at load, before
 * anything boots. Getting this wrong costs a desktop, its setup, and a bare
 * ENOENT with the bill already paid — which is what the boxed bookmarx tasks
 * did until this existed, since their export is built rather than committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTask } from "../src/config.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passk-uploads-"));
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

test("a missing upload source is named at load, with the README beside it", () => {
  // Upload sources are read relative to the working directory, so the test writes one there.
  const here = fs.mkdtempSync(path.join(process.cwd(), "tmp-uploads-"));
  const rel = path.relative(process.cwd(), here);
  try {
    fs.writeFileSync(path.join(here, "README.md"), "run the build");
    const file = write("missing.yaml", `setup:\n  - upload: ${rel}/box.tar.gz\n    to: /root/box.tar.gz\n${TASK}`);
    assert.throws(() => loadTask(file), (err: Error) => {
      assert.match(err.message, /uploads files that are not on this machine/);
      assert.match(err.message, new RegExp(`${rel}/box\\.tar\\.gz`));
      assert.match(err.message, new RegExp(`how to build it: ${rel}/README\\.md`), "a README beside the file is where its build step is written down");
      return true;
    });

    // Present: it loads. The check also covers golden steps, which upload too.
    fs.writeFileSync(path.join(here, "box.tar.gz"), "x");
    assert.equal(loadTask(file).id, "t");
    const golden = write("golden.yaml", `golden:\n  - upload: ${rel}/gone.bin\n    to: /root/gone.bin\n${TASK}`);
    assert.throws(() => loadTask(golden), /gone\.bin/);
  } finally {
    fs.rmSync(here, { recursive: true, force: true });
  }
});

test("a task that uploads nothing, or uploads what it has, loads", () => {
  assert.equal(loadTask(write("plain.yaml", TASK)).id, "t");
  assert.equal(loadTask("tasks/ticket-routing.yaml").id, "ticket-routing");
});
