import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Ajv from "ajv";
import { parse } from "yaml";

const schema = JSON.parse(fs.readFileSync("schema/task.schema.json", "utf8"));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

test("every shipped task validates against the schema", () => {
  for (const f of fs.readdirSync("tasks").filter((f) => f.endsWith(".yaml"))) {
    const doc = parse(fs.readFileSync(`tasks/${f}`, "utf8"));
    assert.ok(validate(doc), `${f}: ${ajv.errorsText(validate.errors)}`);
  }
});

test("the schema rejects the mistakes people actually make", () => {
  assert.equal(validate({ id: "x", name: "x", prompt: "x", checks: [] }), false, "no checks");
  assert.equal(validate({ id: "x", name: "x", prompt: "x", checks: [{ type: "file_contains", path: "/a" }] }), false, "file_contains without text");
  assert.equal(validate({ id: "x", name: "x", prompt: "x", checks: [{ type: "file_exists", path: "/a" }], setup: [{ run: "ls" }] }), false, "unknown setup step");
  assert.equal(validate({ id: "Bad Id", name: "x", prompt: "x", checks: [{ type: "file_exists", path: "/a" }] }), false, "id with spaces");
});
