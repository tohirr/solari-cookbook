import { test } from "node:test";
import assert from "node:assert/strict";
import { fisherExact } from "../src/compare.js";

test("Fisher exact: identical splits give p = 1", () => {
  assert.equal(fisherExact(5, 0, 5, 0), 1);
  assert.ok(Math.abs(fisherExact(3, 2, 3, 2) - 1) < 1e-9);
});

test("Fisher exact: 3/10 vs 9/10 is unlikely to be noise; 4/10 vs 9/10 and 4/5 vs 5/5 are not", () => {
  assert.ok(Math.abs(fisherExact(3, 7, 9, 1) - 0.0198) < 0.001);
  // A reminder of how little ten-vs-ten can prove: this reads as a big jump and still clears 0.05.
  assert.ok(Math.abs(fisherExact(4, 6, 9, 1) - 0.0573) < 0.001);
  assert.ok(Math.abs(fisherExact(4, 1, 5, 0) - 1) < 1e-9);
});

test("Fisher exact matches a textbook value (tea tasting: 3,1,1,3 → 0.486)", () => {
  assert.ok(Math.abs(fisherExact(3, 1, 1, 3) - 0.4857) < 0.001);
});
