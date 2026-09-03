/**
 * `passk recommend <bench>` — what a careful engineer would say after reading
 * every run card, written from the same rules they would use. It suggests
 * the category of the next experiment and what to hold fixed. It does not
 * change anything, and it says "recommendation", not "diagnosis".
 */
import { loadBench } from "./compare.js";
import { lostKind } from "./metrics.js";
import type { BenchResult, RunResult } from "./types.js";

export interface Recommendation {
  observations: string[];
  next: string[];
  keepFixed: string[];
  caution: string[];
}

const claimsSuccess = (r: RunResult) => /\b(saved|done|complete|entered|assigned|created|finished|updated)\b/i.test(r.finalMessage ?? "");

export function recommend(b: BenchResult): Recommendation {
  const m = b.metrics;
  const attempted = b.runs.filter((r) => lostKind(r) === null);
  const failed = attempted.filter((r) => r.status !== "passed");
  const obs: string[] = [], next: string[] = [], caution: string[] = [];
  const keepFixed = ["snapshot", "checks", "model", "step cap"];

  // Verifier first: nothing below means anything if the checks are wrong.
  if (m.lost.verifier) { obs.push(`${m.lost.verifier} run(s) could not be verified because the checker crashed.`); next.push("Fix the task or checker (run `passk validate`) before drawing any conclusion about the agent."); }
  if (m.lost.solari || m.lost.provider) {
    obs.push(`${m.lost.solari + m.lost.provider} run(s) were lost to infrastructure (${m.lost.solari} desktop, ${m.lost.provider} model provider); they are not scored.`);
    if (m.lost.solari + m.lost.provider >= Math.max(2, m.requested * 0.15)) next.push("Fix or retry the infrastructure before changing the agent; losses this frequent will hide any agent effect.");
  }

  if (failed.length === 0) {
    obs.push(`${m.passed}/${m.n} passed. If every run passes, the 95% lower bound is ${(m.passAt1Lower * 100).toFixed(0)}%; more runs are the only way to raise it.`);
    if (m.maxSteps >= Math.max(2 * m.minSteps, m.minSteps + 8)) {
      obs.push(`Effort varied from ${m.minSteps} to ${m.maxSteps} steps for the same outcome: behavior variability that the pass rate hides, and a cost spread of about ${(m.maxSteps / Math.max(1, m.minSteps)).toFixed(1)}×.`);
      next.push("If cost or latency matters, test a prompt that names the short strategy (or a tool restriction), same snapshot, and compare median steps and cost per success rather than pass rate.");
    } else {
      next.push("Extend this bench (`--resume` with a larger --k) until the lower bound meets your requirement, or save it as the regression baseline for this configuration.");
    }
  } else {
    const claims = failed.filter(claimsSuccess).length;
    const causes = new Map<string, number>();
    for (const f of b.failures) if (f.cause !== "unknown") causes.set(f.cause, (causes.get(f.cause) ?? 0) + 1);
    const top = [...causes.entries()].sort((a, b) => b[1] - a[1])[0];
    const capped = failed.filter((r) => r.stoppedBy === "max_steps").length;
    obs.push(`${failed.length}/${m.n} failed.${claims ? ` ${claims} of them reported success anyway.` : ""}${capped ? ` ${capped} hit the step cap.` : ""}`);
    if (top) obs.push(`Dominant hypothesis: ${top[0].replace(/_/g, " ")} (${top[1]}/${b.failures.filter((f) => f.cause !== "unknown").length} classified failures).${b.failures.some((f) => !f.referencePassed) ? " No passing run to compare against, so confidence is low." : ""}`);

    if (claims >= Math.max(1, failed.length / 2)) next.push("The agent cannot tell that it failed. Test a verification instruction that reads state back (reload, re-open, re-query), not a screenshot: the UI may show the intended value whether or not it was persisted.");
    if (top?.[0] === "task_ambiguity") next.push("Runs interpreted the task differently. Test a prompt that resolves the specific ambiguity the failures show (run `passk probe` to list candidates), one clarification at a time.");
    if (top?.[0] === "stochastic_execution") next.push("Plans matched but the environment flinched. Test an environment change (a wait, a pre-opened dialog, a folder that exists) rather than a prompt change.");
    if (top?.[0] === "behavior_variability" && !claims) next.push("Same goal, different routes. Test a prompt that supplies the known-good strategy, or a step cap that makes detours fail fast; compare effort as well as pass rate.");
    if (capped && capped === failed.length) caution.push("Every failure hit the step cap: some may have finished with a larger budget. Consider a second bench with a higher cap before changing the agent.");
    if (!next.length) next.push("Read the failed runs' filmstrips at the divergence step before choosing an intervention; the classifier could not single one out.");
  }

  caution.push("Change exactly one of prompt, environment, model or plan per experiment, fork the same snapshot, and use `passk compare`. A comparison where two things changed cannot attribute the result.");
  if (m.n < 10) caution.push(`n=${m.n} is directional evidence. Use k=5 per condition to choose between interventions and k=10+ for the configuration you keep.`);
  return { observations: obs, next, keepFixed, caution };
}

export function formatRecommendation(b: BenchResult, r: Recommendation): string {
  return [
    `${b.taskName}: ${b.metrics.passed}/${b.metrics.n} passed`,
    "", "Observations:", ...r.observations.map((x) => `  - ${x}`),
    "", "Suggested next experiment (a recommendation, not a diagnosis):", ...r.next.map((x) => `  - ${x}`),
    "", `Keep fixed: ${r.keepFixed.join(", ")}`,
    "", ...r.caution.map((x) => `  ! ${x}`),
  ].join("\n");
}

export function recommendDir(dir: string): string {
  const b = loadBench(dir);
  return formatRecommendation(b, recommend(b));
}
