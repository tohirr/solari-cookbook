/**
 * Decides whether a run passed by inspecting the desktop AFTER the agent
 * stops — never by trusting what the agent said it did.
 */
import { z } from "zod";
import type { Desktop } from "@solarisdk/sdk";
import { structured } from "./llm.js";
import type { Check, CheckResult } from "./types.js";

const Judgement = z.object({
  passed: z.boolean(),
  reason: z.string(),
});

export async function runChecks(desktop: Desktop, checks: Check[], finalScreenshot?: Uint8Array): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const check of checks) {
    try {
      out.push(await runCheck(desktop, check, finalScreenshot));
    } catch (err) {
      out.push({ check, passed: false, detail: `check errored: ${(err as Error).message}` });
    }
  }
  return out;
}

async function runCheck(desktop: Desktop, check: Check, finalScreenshot?: Uint8Array): Promise<CheckResult> {
  switch (check.type) {
    case "file_exists": {
      try { await desktop.fs.stat(check.path); return { check, passed: true }; }
      catch { return { check, passed: false, detail: await whereIsIt(desktop, check.path) }; }
    }
    case "file_contains": {
      const text = await readOr(desktop, check.path);
      if (text === null) return { check, passed: false, detail: await whereIsIt(desktop, check.path) };
      const passed = text.includes(check.text);
      return { check, passed, detail: passed ? undefined : `file content: ${JSON.stringify(text.slice(0, 200))}` };
    }
    case "file_equals": {
      const text = await readOr(desktop, check.path);
      if (text === null) return { check, passed: false, detail: await whereIsIt(desktop, check.path) };
      const passed = text.trim() === check.text.trim();
      return { check, passed, detail: passed ? undefined : `file content: ${JSON.stringify(text.slice(0, 200))}` };
    }
    case "exec": {
      const r = await desktop.exec(check.cmd, { args: check.args ?? [] });
      const codeOk = r.exitCode === (check.exit_code ?? 0);
      const outOk = check.stdout_contains ? r.stdout.includes(check.stdout_contains) : true;
      return { check, passed: codeOk && outOk, detail: codeOk && outOk ? undefined : `exit ${r.exitCode}, stdout ${JSON.stringify(r.stdout.slice(0, 200))}` };
    }
    case "screenshot_judge": {
      const png = finalScreenshot ?? (await desktop.screenshot({ format: "png" }));
      const j = await structured({
        name: "judgement", schema: Judgement, images: [png], maxTokens: 2000,
        prompt: `You are grading the final state of a desktop after an agent worked on it.\nRubric: ${check.rubric}\nDecide strictly from what is visible.`,
      });
      return { check, passed: j?.passed ?? false, detail: j?.reason ?? "judge returned nothing" };
    }
  }
}

async function readOr(desktop: Desktop, p: string): Promise<string | null> {
  try { return await desktop.fs.readText(p); } catch { return null; }
}

/**
 * When the expected file is missing, find out where it actually went. "not
 * found" is a dead end; "found at /root/Documents/.notes.txt" is a diagnosis.
 */
async function whereIsIt(desktop: Desktop, expected: string): Promise<string> {
  const base = expected.split("/").pop() ?? expected;
  const stem = base.replace(/^\./, "").replace(/\.[^.]+$/, "");
  try {
    const r = await desktop.exec("sh", { args: ["-c",
      `find / -xdev \\( -path /proc -o -path /sys -o -path /usr -o -path /var/lib \\) -prune -o -type f -iname '*${stem}*' -newer /etc/hostname -print 2>/dev/null | head -5`] });
    const hits = r.stdout.trim().split("\n").filter(Boolean);
    return hits.length ? `${expected} not found; similar files: ${hits.join(", ")}` : `${expected} not found (no similar file anywhere on disk)`;
  } catch {
    return `${expected} not found`;
  }
}
