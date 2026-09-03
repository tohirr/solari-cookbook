/**
 * An in-memory stand-in for a Solari desktop, for testing the orchestration
 * without a VM or a model. It implements only the members passk's runner,
 * checker and agents actually touch: a tiny filesystem, an exec that can
 * `cat`, a screenshot that returns a fixed PNG, and the lifecycle calls.
 *
 * Nothing here is clever. Its value is that a 200-run bench of the real
 * runner, real checker, real metrics and real persistence takes two seconds
 * and costs nothing, so resume, budgets and failure accounting can be tested
 * under injected faults.
 */
import type { Desktop } from "@solarisdk/sdk";

// 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let seq = 0;
/** Every fake desktop ever created, so tests can assert on leaks and teardown. */
export const fakeRegistry = new Map<string, FakeDesktop>();

export class FakeDesktop {
  readonly id: string;
  readonly streamUrl: string;
  readonly files = new Map<string, string>();
  killed = false;
  connected = false;
  /** Screenshots taken; the trace of a scripted run is derived from this. */
  screenshots = 0;

  constructor(seed: Map<string, string> = new Map()) {
    this.id = `fake_${++seq}`;
    this.streamUrl = `fake://${this.id}`;
    for (const [k, v] of seed) this.files.set(k, v);
    fakeRegistry.set(this.id, this);
  }
  async connect() { this.connected = true; }
  async reconnect() { this.connected = true; }
  async health() { return { ready: true, display: true, vnc: true }; }
  async screenshot() { this.screenshots++; return new Uint8Array(PNG); }
  async kill() { this.killed = true; this.connected = false; }
  async snapshot(name?: string) { return `snap_fake_${name ?? seq}`; }
  async open() { return 1; }
  readonly display = { cursor: async () => ({ x: 0, y: 0 }), size: async () => ({ w: 1280, h: 720 }), set: async () => {} };
  readonly mouse = { move: async () => {}, click: async () => {}, doubleClick: async () => {}, down: async () => {}, up: async () => {}, scroll: async () => {}, drag: async () => {} };
  readonly keyboard = { type: async () => {}, press: async () => {}, hotkey: async () => {}, down: async () => {}, up: async () => {} };
  readonly fs = {
    readText: async (p: string) => { const v = this.files.get(p); if (v === undefined) throw new Error(`ENOENT ${p}`); return v; },
    read: async (p: string) => new TextEncoder().encode(await this.fs.readText(p)),
    write: async (p: string, data: Uint8Array | string) => { this.files.set(p, typeof data === "string" ? data : new TextDecoder().decode(data)); },
    stat: async (p: string) => { if (!this.files.has(p)) throw new Error(`ENOENT ${p}`); return { path: p, size: this.files.get(p)!.length, isDir: false } as unknown; },
    list: async () => [] as unknown[],
    remove: async (p: string) => { this.files.delete(p); },
    mkdir: async () => {},
  };
  /** `cat <path>` and `sh -c "cat <path>"` read the fake filesystem; anything else exits 0 with empty output. */
  async exec(cmd: string, opts?: { args?: string[] }) {
    const args = opts?.args ?? [];
    const line = cmd === "sh" && args[0] === "-c" ? args[1] : [cmd, ...args].join(" ");
    const m = line.match(/^cat\s+(\S+)/);
    if (m) {
      const v = this.files.get(m[1]);
      return v === undefined ? { exitCode: 1, stdout: "", stderr: `cat: ${m[1]}: No such file` } : { exitCode: 0, stdout: v, stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  asDesktop(): Desktop { return this as unknown as Desktop; }
}
