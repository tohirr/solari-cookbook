/**
 * `passk probe <task>` — the dry-run twin.
 *
 * Pinetree's reliability paper recommends letting agents resolve ambiguity
 * through interaction instead of guessing. Before you spend k runs, fork one
 * throwaway desktop, let the agent LOOK (but not act destructively), and have
 * it list every question it would ask a human. Tighten the prompt, re-probe,
 * then bench.
 */
import { z } from "zod";
import type { Desktop } from "@solarisdk/sdk";
import path from "node:path";
import { runAgent } from "./agent/index.js";
import { config, readSnapshots } from "./config.js";
import { structured } from "./llm.js";
import { destroyDesktop, forkDesktop } from "./desktop.js";
import type { Task } from "./types.js";

const Probe = z.object({
  interpretation: z.string().describe("How the agent understood the task, in one sentence."),
  ambiguities: z.array(z.object({
    question: z.string(),
    why_it_matters: z.string(),
    default_assumption: z.string(),
  })),
  risk: z.enum(["low", "medium", "high"]).describe("How likely different runs are to interpret this task differently."),
});
export type ProbeResult = z.infer<typeof Probe>;

const PROBE_SYSTEM = `You are inspecting a Linux desktop to understand a task BEFORE doing it.
Take screenshots, open menus, look at files — but do not change anything that matters.
Use at most 8 actions. Then stop and write down: how you interpret the task, and every
question you would want to ask the person who wrote it before committing to a plan.`;

export async function probeTask(task: Task, snapshotId = readSnapshots()[task.id]): Promise<ProbeResult> {
  if (!snapshotId) throw new Error(`no snapshot for task "${task.id}" — run \`passk prepare\` first`);
  let desktop: Desktop | undefined;
  try {
    desktop = await forkDesktop(snapshotId, { resolution: task.resolution, metadata: { task: task.id, role: "probe" } });
    console.log(`probe desktop ${desktop.id}  watch: ${desktop.streamUrl}`);
    const agent = await runAgent({
      desktop, prompt: task.prompt, maxSteps: 8, systemPrompt: PROBE_SYSTEM,
      outDir: path.join(config.runsDir, `probe-${task.id}`),
      onStep: (s) => console.log(`  #${s.index} ${s.name}`),
    });

    const parsed = await structured({
      name: "probe", schema: Probe, maxTokens: 4000,
      prompt: `Task: """${task.prompt}"""\n\nAn agent explored the desktop and reported:\n"""${agent.finalMessage}"""\n\nActions it took: ${agent.steps.map((s) => s.name).join(", ")}\n\nExtract the interpretation and the open questions.`,
    });
    return parsed ?? { interpretation: agent.finalMessage, ambiguities: [], risk: "medium" };
  } finally {
    await destroyDesktop(desktop);
  }
}
