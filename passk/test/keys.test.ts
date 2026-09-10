import { test } from "node:test";
import assert from "node:assert/strict";
process.env.PASSK_PROVIDER = "scripted";
const { parseKeyChord } = await import("../src/agent/computer.js");

test("chords are spelt the way xdotool wants them", () => {
  assert.deepEqual(parseKeyChord("ctrl+-"), ["ctrl", "minus"]);
  assert.deepEqual(parseKeyChord("ctrl+="), ["ctrl", "equal"]);
  assert.deepEqual(parseKeyChord("cmd+A"), ["super", "a"]);
  assert.deepEqual(parseKeyChord("alt+Tab"), ["alt", "Tab"]);
  assert.deepEqual(parseKeyChord("Return"), ["Return"]);
});
