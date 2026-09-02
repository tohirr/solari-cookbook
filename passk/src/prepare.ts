/**
 * `passk prepare <task>` — boot a desktop, run the task's setup steps, and
 * snapshot it. Every later run forks this snapshot, so the agent sees the
 * exact same pixels on attempt 1 and attempt 50.
 */
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

async function runSetupStep(desktop: Desktop, step: SetupStep): Promise<void> {
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
  } else if ("wait" in step) {
    await sleep(step.wait * 1000);
  }
}
