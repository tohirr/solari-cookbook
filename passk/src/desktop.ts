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
import { FakeDesktop } from "./fake/desktop.js";

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
  if (config.fake) {
    const fake = new FakeDesktop();
    await fake.connect();
    return fake.asDesktop();
  }
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
  try {
    await desktop.connect();
    await waitReady(desktop);
  } catch (err) {
    // The VM exists even though we can't use it; destroy it or it bills until idle timeout.
    await destroyDesktop(desktop);
    throw err;
  }
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

/** Fake desktops are never listed by Solari; sweeps and leak checks skip them. */
export const isFake = () => config.fake;

/** Boot an independent copy of a snapshot. Every fork starts byte-identical. */
export function forkDesktop(snapshotId: string, opts: Omit<BootOptions, "fromSnapshot" | "template"> = {}): Promise<Desktop> {
  return bootDesktop({ ...opts, fromSnapshot: snapshotId });
}

/**
 * Best-effort teardown: never let a cleanup error mask the real one. The
 * handle's kill() goes over the control channel; when that channel is the
 * thing that broke ("Not connected"), fall back to the plain HTTP delete so
 * the VM does not sit there holding a slot until its idle timeout.
 */
export async function destroyDesktop(desktop: Desktop | undefined): Promise<void> {
  if (!desktop) return;
  try {
    await desktop.kill();
    return;
  } catch (err) {
    console.warn(`warn: kill() failed for ${desktop.id.slice(0, 16)}… (${(err as Error).message}); trying HTTP delete`);
  }
  try {
    await solari().sandboxes.kill(desktop.id);
  } catch (err) {
    console.warn(`warn: HTTP delete also failed for ${desktop.id.slice(0, 16)}…: ${(err as Error).message}`);
  }
}

/**
 * Run one desktop call; if the control channel has dropped ("Not connected"),
 * reconnect once and retry. Seen on the office template right after a fork:
 * the channel is up for connect() and health(), then gone by the first action.
 */
export async function withReconnect<T>(desktop: Desktop, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // "Not connected — call connect() first" and "Control channel closed (1006)" are the
    // two spellings of the same event: the WebSocket went away under us.
    if (!/not connected|channel closed/i.test((err as Error).message)) throw err;
    await desktop.reconnect();
    await sleep(500);
    return fn();
  }
}

export function parseResolution(res: string): { width: number; height: number } {
  const m = res.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`bad resolution "${res}", expected e.g. 1280x720`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
