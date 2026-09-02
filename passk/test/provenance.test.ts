import { test } from "node:test";
import assert from "node:assert/strict";
import { taskHash } from "../src/provenance.js";
import type { Task } from "../src/types.js";

const task: Task = { id: "t", name: "T", prompt: "do it", checks: [{ type: "file_exists", path: "/tmp/x" }] };

test("task hash is stable under key order and changes when a check changes", () => {
  const reordered = { checks: task.checks, prompt: task.prompt, name: task.name, id: task.id } as Task;
  assert.equal(taskHash(task), taskHash(reordered));
  const stricter: Task = { ...task, checks: [{ type: "file_contains", path: "/tmp/x", text: "y" }] };
  assert.notEqual(taskHash(task), taskHash(stricter));
});
