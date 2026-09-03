/**
 * `passk validate <task>` — verify the verifier before spending on an agent.
 *
 * On a fresh fork of the task's snapshot:
 *   1. the checks must FAIL on the untouched state (a check that already
 *      passes proves nothing about the agent);
 *   2. after the task's `golden` steps, the checks must PASS (otherwise the
 *      verifier, the golden steps, or the environment is wrong);
 *   3. run twice, the checks must agree (a flaky verifier makes every
 *      number downstream meaningless).
 * Costs one desktop boot and no model calls. This is the command that would
 * have caught the exit-code bug and the /root upload refusal on day one.
 */
import type { Desktop } from "@solarisdk/sdk";
import { runChecks } from "./checker.js";
import { readSnapshots } from "./config.js";
import { destroyDesktop, forkDesktop, isFake } from "./desktop.js";
import { runSetupStep } from "./prepare.js";
import type { CheckResult, Task } from "./types.js";

export interface ValidationReport {
  ok: boolean;
  problems: string[];
  notes: string[];
  initial: CheckResult[];
  golden: CheckResult[] | null;
}

const label = (c: CheckResult) => `${c.check.type} ${"path" in c.check ? c.check.path : "cmd" in c.check ? c.check.cmd : ""}`.trim();

export async function validateTask(task: Task, snapshotId = readSnapshots()[task.id] ?? (isFake() ? "snap_fake" : "")): Promise<ValidationReport> {
  if (!snapshotId) throw new Error(`no snapshot for task "${task.id}" — run \`passk prepare\` first`);
  const problems: string[] = [], notes: string[] = [];
  let desktop: Desktop | undefined;
  let golden: CheckResult[] | null = null;
  let initial: CheckResult[] = [];
  try {
    desktop = await forkDesktop(snapshotId, { resolution: task.resolution, metadata: { task: task.id, role: "validate" } });

    // 1. Untouched state: every check should fail, and none should error.
    initial = await runChecks(desktop, task.checks);
    const again = await runChecks(desktop, task.checks);
    for (const [i, c] of initial.entries()) {
      const inv = !!task.checks[i].invariant;
      if (c.errored) problems.push(`check ${i} (${label(c)}) could not run on the untouched state: ${c.detail}`);
      else if (inv && !c.passed) problems.push(`invariant check ${i} (${label(c)}) fails on the untouched state; it should hold before the agent acts: ${c.detail ?? ""}`);
      else if (!inv && c.passed) problems.push(`check ${i} (${label(c)}) already passes before any agent acts; it cannot tell success from doing nothing (mark it \`invariant: true\` if it is a guard)`);
      if (c.passed !== again[i].passed) problems.push(`check ${i} (${label(c)}) gave different answers on two consecutive runs`);
    }
    const goals = task.checks.filter((c) => !c.invariant).length, invs = task.checks.length - goals;
    notes.push(`${initial.filter((c, i) => !task.checks[i].invariant && !c.passed && !c.errored).length}/${goals} goal checks fail on the untouched snapshot, as they should${invs ? `; ${initial.filter((c, i) => task.checks[i].invariant && c.passed).length}/${invs} invariants hold` : ""}`);
    if (goals === 0) problems.push("every check is an invariant; nothing distinguishes success from doing nothing");

    // 2. Golden state: after the task's own recipe for success, every check should pass.
    if (task.golden?.length) {
      for (const step of task.golden) await runSetupStep(desktop, step);
      golden = await runChecks(desktop, task.checks);
      for (const [i, c] of golden.entries()) {
        if (c.errored) problems.push(`check ${i} (${label(c)}) could not run after the golden steps: ${c.detail}`);
        else if (!c.passed) problems.push(`check ${i} (${label(c)}) still fails after the golden steps: ${c.detail ?? "no detail"}`);
      }
      if (golden.every((c) => c.passed)) notes.push(`all ${golden.length} checks pass after the golden steps`);
    } else {
      notes.push("no `golden` steps in the task: the checks were shown to fail on the initial state, but not shown to be satisfiable");
    }
  } finally {
    await destroyDesktop(desktop);
  }
  return { ok: problems.length === 0, problems, notes, initial, golden };
}
