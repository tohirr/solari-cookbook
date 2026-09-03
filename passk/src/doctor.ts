/**
 * `passk doctor` — the first-run failures, found in one place before a bench
 * finds them one at a time: keys present, Solari reachable and a desktop
 * bootable, the model key accepted, and what a run would use.
 */
import { config } from "./config.js";
import { bootDesktop, destroyDesktop, solari } from "./desktop.js";

type Line = { ok: boolean; warn?: boolean; label: string; detail: string };
const line = (ok: boolean, label: string, detail: string, warn = false): Line => ({ ok, warn, label, detail });

export async function doctor(): Promise<boolean> {
  const out: Line[] = [];
  const has = (k: string) => !!process.env[k] && !process.env[k]!.includes("...");

  // Provider and model
  let provider: string | undefined;
  try { provider = config.provider; out.push(line(true, "provider", `${provider} · model ${config.model} · effort ${config.effort}`)); }
  catch (err) { out.push(line(false, "provider", (err as Error).message)); }

  if (provider === "scripted") {
    out.push(line(true, "mode", "scripted: no Solari, no model; the harness runs against in-memory desktops"));
  } else {
    // Solari
    if (!has("SOLARI_API_KEY")) out.push(line(false, "Solari key", "SOLARI_API_KEY is missing or still the placeholder"));
    else {
      try {
        const running = (await solari().sandboxes.list({ state: "running" })).sandboxes;
        const mine = running.filter((s) => s.metadata?.app === "passk");
        out.push(line(true, "Solari API", `reachable · ${running.length} running session${running.length === 1 ? "" : "s"}${mine.length ? ` (${mine.length} tagged passk: a leak from an interrupted bench? \`passk sweep\` kills them)` : ""}`));
        const t0 = Date.now();
        const d = await bootDesktop({ template: "default", metadata: { role: "doctor" } });
        await destroyDesktop(d);
        out.push(line(true, "desktop boot", `default template booted, reported ready and was killed in ${((Date.now() - t0) / 1000).toFixed(1)}s`));
      } catch (err) {
        const msg = (err as Error).message;
        out.push(line(false, "Solari", /concurrent/i.test(msg) ? `${msg}: every slot on the plan is in use (Starter allows 2)` : msg));
      }
    }
    // Model key: the cheapest possible request.
    try {
      if (provider === "openai") {
        const { openai } = await import("./llm.js");
        const r = await openai().responses.create({ model: config.model, max_output_tokens: 16, input: "ok" });
        out.push(line(true, "model key", `OpenAI accepted a request · served by ${r.model}`));
      } else if (provider === "anthropic") {
        const { anthropic } = await import("./llm.js");
        const r = await anthropic().messages.create({ model: config.model, max_tokens: 5, messages: [{ role: "user", content: "ok" }] });
        out.push(line(true, "model key", `Anthropic accepted a request · served by ${r.model}`));
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      out.push(line(false, "model key", status === 401 ? "rejected as invalid (401): this is not an API key, or it is from the wrong console" : status === 429 || /credit|billing|quota/i.test(String((err as Error).message)) ? `accepted but cannot spend: ${(err as Error).message.slice(0, 120)}` : (err as Error).message.slice(0, 160)));
    }
  }

  out.push(line(true, "concurrency", `${config.concurrency} desktops at a time (PASSK_CONCURRENCY; Starter plan allows 2, Professional 10)`));
  out.push(line(true, "safety checks", config.safety === "allow" ? "PASSK_SAFETY=allow: the model's safety checks are acknowledged automatically. Fine for disposable bench VMs; never for anything real." : "deny (default): a run stops on a safety check", config.safety === "allow"));
  out.push(line(true, "classification", process.env.PASSK_CLASSIFY === "0" ? "off (PASSK_CLASSIFY=0)" : "on: failures get a hypothesis from the model"));

  for (const l of out) console.log(`${l.ok ? (l.warn ? "⚠" : "✓") : "✗"} ${l.label.padEnd(16)} ${l.detail}`);
  const bad = out.filter((l) => !l.ok);
  console.log(bad.length ? `\n${bad.length} problem${bad.length === 1 ? "" : "s"}` : "\nready");
  return bad.length === 0;
}
