/**
 * Thin helpers over the Solari SDK for the three things passk does with a
 * desktop: boot one, snapshot it, and fork it.
 *
 * Desktops are created through `pt.sandboxes.createDesktop`, not
 * `pt.desktops.create` — only the sandbox-flavoured route accepts
 * `fromSnapshot`, and it hands back the same `Desktop` handle with
 * `snapshot()` / `revert()` / `kill()` wired up.
 */
import { SolariClient, type Desktop } from "@solarisdk/sdk";
import { config } from "./config.js";

let client: SolariClient | undefined;
export function solari(): SolariClient {
  return (client ??= new SolariClient({ apiKey: config.solariApiKey }));
}

export interface BootOptions {
  template?: string;
  resolution?: string;
  fromSnapshot?: string;
  metadata?: Record<string, string>;
  /** Server-side mp4 recording of the session (desktop only). */
  record?: boolean;
}

/** Create a desktop, open its control channel, and wait for X11 + VNC. */
export async function bootDesktop(opts: BootOptions): Promise<Desktop> {
  const desktop = await solari().sandboxes.createDesktop({
    template: opts.fromSnapshot ? undefined : (opts.template ?? "default"),
    fromSnapshot: opts.fromSnapshot,
    resolution: opts.resolution ?? "1280x720",
    timeoutMs: config.desktopTimeoutMs,
    // A bench run must never leave a paused VM billing in the background.
    lifecycle: { onTimeout: "kill" },
    metadata: { app: "passk", ...opts.metadata },
    record: opts.record,
  });
  await desktop.connect();
  await waitReady(desktop);
  return desktop;
}

export async function waitReady(desktop: Desktop, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const h = await desktop.health();
      if (h.ready) return;
    } catch {
      /* agent not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`desktop ${desktop.id} did not become ready in ${timeoutMs}ms`);
}

/** Checkpoint a running desktop. The desktop keeps running; forks boot from here. */
export async function snapshotDesktop(desktop: Desktop, name: string): Promise<string> {
  return desktop.snapshot(name);
}

/** Boot an independent copy of a snapshot. Every fork starts byte-identical. */
export function forkDesktop(snapshotId: string, opts: Omit<BootOptions, "fromSnapshot" | "template"> = {}): Promise<Desktop> {
  return bootDesktop({ ...opts, fromSnapshot: snapshotId });
}

/** Best-effort teardown: never let a cleanup error mask the real one. */
export async function destroyDesktop(desktop: Desktop | undefined): Promise<void> {
  if (!desktop) return;
  try {
    await desktop.kill();
  } catch (err) {
    console.warn(`warn: failed to kill ${desktop.id}:`, (err as Error).message);
  }
}

export function parseResolution(res: string): { width: number; height: number } {
  const m = res.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`bad resolution "${res}", expected e.g. 1280x720`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
