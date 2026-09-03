/**
 * `passk prepare <task>` — boot a desktop, run the task's setup steps, and
 * snapshot it. Every later run forks this snapshot, so the agent sees the
 * exact same pixels on attempt 1 and attempt 50.
 */
import fs from "node:fs";
import type { Desktop } from "@solarisdk/sdk";
import { bootDesktop, destroyDesktop, sleep, snapshotDesktop } from "./desktop.js";
import { writeSnapshot } from "./config.js";
import type { SetupStep, Task } from "./types.js";

export async function prepareTask(task: Task): Promise<string> {
  let desktop: Desktop | undefined;
  try {
    console.log(`booting ${task.template} desktop at ${task.resolution} …`);
    desktop = await bootDesktop({ template: task.template, resolution: task.resolution, metadata: { task: task.id, role: "golden" } });
    console.log(`desktop ${desktop.id}  watch: ${desktop.streamUrl}`);

    for (const step of task.setup ?? []) await runSetupStep(desktop, step);

    // Let the window manager settle so the snapshot doesn't capture a half-drawn app.
    await sleep(2000);
    const snapshotId = await snapshotDesktop(desktop, `passk:${task.id}`);
    writeSnapshot(task.id, snapshotId);
    console.log(`snapshot ${snapshotId} saved for task "${task.id}"`);
    return snapshotId;
  } finally {
    await destroyDesktop(desktop);
  }
}

export async function runSetupStep(desktop: Desktop, step: SetupStep): Promise<void> {
  if ("exec" in step) {
    const r = await desktop.exec(step.exec, { args: step.args ?? [] });
    console.log(`  exec ${step.exec} ${(step.args ?? []).join(" ")} → exit ${r.exitCode}`);
    if (r.exitCode !== 0) throw new Error(`setup exec failed: ${r.stderr || r.stdout}`);
  } else if ("open" in step) {
    const pid = await desktop.open(step.open, step.args);
    console.log(`  open ${step.open} → pid ${pid}`);
  } else if ("write" in step) {
    await desktop.fs.write(step.write, step.content);
    console.log(`  write ${step.write} (${step.content.length} bytes)`);
  } else if ("upload" in step) {
    await desktop.fs.write(step.to, fs.readFileSync(step.upload));
    console.log(`  upload ${step.upload} → ${step.to}`);
  } else if ("type" in step) {
    await desktop.keyboard.type(step.type);
    console.log(`  type ${JSON.stringify(step.type)}`);
  } else if ("press" in step) {
    await desktop.keyboard.press(step.press);
    console.log(`  press ${step.press}`);
  } else if ("click" in step) {
    await desktop.mouse.click(step.click[0], step.click[1]);
    console.log(`  click ${step.click.join(",")}`);
  } else if ("wait" in step) {
    await sleep(step.wait * 1000);
  }
}
