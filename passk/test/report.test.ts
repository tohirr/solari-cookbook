import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLabel } from "../src/checker.js";
import { dotsHtml, tailStat, wordDiffHtml } from "../src/report/theme.js";

test("a tail statistic is only shown when the sample can carry it", () => {
  assert.equal(tailStat(5), null);
  assert.equal(tailStat(9), null);
  assert.deepEqual(tailStat(10), { label: "p90", p: 0.9 });
  assert.deepEqual(tailStat(19), { label: "p90", p: 0.9 });
  assert.deepEqual(tailStat(20), { label: "p95", p: 0.95 });
});

test("the prompt diff marks only the words that changed", () => {
  const html = wordDiffHtml("Save the ticket and verify it.", "Save the ticket, reload the page, and verify it.");
  assert.ok(html.includes("<del>ticket</del>") && html.includes("<ins>ticket, reload the page,</ins>"), html);
  assert.ok(!html.includes("<del>Save"), "unchanged words are not marked");
  assert.equal(wordDiffHtml("same words", "same words"), "same words");
  assert.ok(wordDiffHtml("a <b>", "a &").includes("&lt;b&gt;"), "escaped");
});

test("dots carry a glyph, a label, a link, and wrap into rows of ten past ten runs", () => {
  const runs = (n: number) => Array.from({ length: n }, (_, i) => ({ status: i === 3 ? "failed" : "passed", runIndex: i, steps: 5 }));
  const small = dotsHtml(runs(5), 0, "", (i) => `#run-${i}`);
  assert.equal((small.match(/class="dotrow"/g) ?? []).length, 1);
  assert.ok(small.includes(`href="#run-3"`) && small.includes(">×<") && small.includes(">✓<"));
  assert.ok(small.includes(`aria-label="run 3: failed in 5 steps"`));
  const big = dotsHtml(runs(23), 2);
  assert.equal((big.match(/class="dotrow"/g) ?? []).length, 3);
  assert.ok(big.includes("<em>10</em>") && big.includes("<em>20</em>"));
  assert.ok(!big.includes("<a "), "no links without an href");
});

test("a check is labelled by its name when it has one, else by what it does", () => {
  assert.equal(checkLabel({ type: "exec", cmd: "python3", args: ["/root/check.py"] }), "exec python3 /root/check.py");
  assert.equal(checkLabel({ type: "file_exists", path: "/a", name: "The file exists" }), "The file exists");
  assert.equal(checkLabel({ type: "screenshot_judge", rubric: "r" }), "screenshot_judge");
});
