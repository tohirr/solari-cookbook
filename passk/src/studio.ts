/**
 * `passk studio` — the results board, served from this machine, with a Run
 * button that works. Binds to 127.0.0.1 only. Keys are written to .env here
 * and never sent anywhere but Solari and the model provider by the runs you
 * start; the page is told which keys exist, never their values. Each run is
 * the CLI in a child process with the same arguments the board prints, so
 * what the button does and what the docs say are one thing.
 *
 *   passk studio [--port 8787] [--no-open]
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PRICES } from "./metrics.js";
import { buildShapes, loadBenches, providerFor, renderBoard, totalsOf, type BoardBench } from "./report/board.js";
import { usd } from "./report/theme.js";

const KEY_NAMES = ["SOLARI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;
const keySet = (name: string) => !!process.env[name] && !process.env[name]!.includes("...");

interface Job {
  id: string; task: string; model: string; k: number; status: "queued" | "running" | "done" | "failed" | "stopped";
  startedAt: string; phase?: string; dir?: string; href?: string; error?: string; log: string[]; cmd: string;
  progress?: { done: number; passed: number; spent: number };
  child?: ChildProcess;
}

export interface StudioOptions { port?: number; open?: boolean; root?: string; runsDir?: string; evidenceDir?: string }

export function startStudio(opts: StudioOptions = {}): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  const root = path.resolve(opts.root ?? ".");
  const runsDir = path.resolve(opts.runsDir ?? process.env.PASSK_RUNS_DIR ?? path.join(root, "runs"));
  const evidenceDir = path.resolve(opts.evidenceDir ?? path.join(root, "evidence"));
  const jobs: Job[] = [];

  const benches = (): BoardBench[] => [...loadBenches(evidenceDir, "evidence", "/evidence/"), ...loadBenches(runsDir, "local", "/runs/")];
  const keys = () => Object.fromEntries(KEY_NAMES.map((k) => [k, keySet(k)]));
  const publicJob = (j: Job) => ({ id: j.id, task: j.task, model: j.model, k: j.k, status: j.status, startedAt: j.startedAt, phase: j.phase, href: j.href, error: j.error, log: j.log.slice(-6), cmd: j.cmd, progress: j.progress });
  const totalsHtml = (all: BoardBench[]) => {
    const t = totalsOf(all);
    const local = all.filter((x) => x.source === "local").reduce((a, x) => a + x.b.runs.length, 0);
    return `${t.runs} verified runs · ${local} local runs in <code>runs/</code> · ${t.models} model${t.models === 1 ? "" : "s"} with evidence · ${usd(t.spend, 2)} of published model spend.`;
  };

  const refreshJob = (j: Job) => { if (j.dir) j.progress = progressOf(j.dir) ?? j.progress; };

  // One bench at a time: two benches would compete for the Solari concurrency slots and both slow down.
  type Spec = Parameters<typeof startJob>[0];
  const specs = new Map<string, Spec>();
  const pump = () => {
    if (jobs.some((j) => j.status === "running")) return;
    const next = jobs.find((j) => j.status === "queued");
    if (!next) return;
    startJob(specs.get(next.id)!, next, pump);
    specs.delete(next.id);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (code: number, body: string | Buffer, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(body); };
    const json = (code: number, obj: unknown) => send(code, JSON.stringify(obj));
    try {
      if (req.method === "GET" && url.pathname === "/") {
        const all = benches();
        return send(200, renderBoard({ mode: "studio", shapes: buildShapes(all), totals: totalsOf(all), keys: keys() }), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        for (const j of jobs) if (j.status === "running") refreshJob(j);
        const all = benches();
        return json(200, { shapes: buildShapes(all), keys: keys(), jobs: jobs.map(publicJob), totalsHtml: totalsHtml(all) });
      }
      if (req.method === "POST" && url.pathname === "/api/keys") {
        const body = await readJson(req);
        const given = Object.entries(body).filter(([k, v]) => (KEY_NAMES as readonly string[]).includes(k) && typeof v === "string" && v.trim() && !/[\r\n]/.test(v)) as [string, string][];
        if (!given.length) return json(400, { error: "no recognised key given" });
        writeEnv(path.join(root, ".env"), given);
        for (const [k, v] of given) process.env[k] = v.trim();
        return json(200, { saved: given.map(([k]) => k), keys: keys() });
      }
      if (req.method === "POST" && url.pathname === "/api/run") {
        const body = await readJson(req);
        const task = String(body.task ?? "");
        const model = String(body.model ?? "");
        const k = Math.floor(Number(body.k));
        const concurrency = Math.floor(Number(body.concurrency ?? 2));
        const budget = Number(body.budget ?? 1);
        if (!/^[a-z0-9-]+$/.test(task) || !fs.existsSync(path.join(root, "tasks", `${task}.yaml`))) return json(400, { error: `no task file tasks/${task}.yaml` });
        if (!(model in PRICES) && model !== "scripted") return json(400, { error: `unknown model ${model}; add it to PRICES in src/metrics.ts` });
        if (!(k >= 1 && k <= 200) || !(concurrency >= 1 && concurrency <= 10) || !(budget >= 0)) return json(400, { error: "k must be 1–200, concurrency 1–10, budget ≥ 0" });
        const provider = providerFor(model);
        const need = provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : null;
        if (provider !== "scripted" && !keySet("SOLARI_API_KEY")) return json(400, { error: "SOLARI_API_KEY is not set; save it below first" });
        if (need && !keySet(need)) return json(400, { error: `${need} is not set; save it below first` });
        if (jobs.some((j) => (j.status === "running" || j.status === "queued") && j.task === task && j.model === model)) return json(409, { error: `${model} on ${task} is already running or queued` });
        const spec: Spec = { root, runsDir, task, model, k, concurrency, budget, safety: body.safety !== false, provider };
        const job = newJob(spec);
        jobs.push(job);
        specs.set(job.id, spec);
        pump();
        return json(200, publicJob(job));
      }
      const cancel = url.pathname.match(/^\/api\/jobs\/([a-z0-9]+)\/cancel$/);
      if (req.method === "POST" && cancel) {
        const j = jobs.find((x) => x.id === cancel[1]);
        if (!j) return json(404, { error: "no such job" });
        if (j.status === "queued") { j.status = "stopped"; j.phase = "removed from the queue"; specs.delete(j.id); }
        else if (j.status === "running" && j.child) { j.child.kill("SIGINT"); j.status = "stopped"; j.phase = "stopped; desktops are killed by the run on exit, or by `passk sweep`"; setTimeout(pump, 500); }
        return json(200, publicJob(j));
      }
      // Reports and screenshots, from the two bench folders only.
      const file = url.pathname.match(/^\/(evidence|runs)\/(.+)$/);
      if (req.method === "GET" && file) {
        const base = file[1] === "evidence" ? evidenceDir : runsDir;
        const p = path.resolve(base, decodeURIComponent(file[2]));
        if (!p.startsWith(base + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return send(404, "not found", "text/plain");
        return send(200, fs.readFileSync(p), MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream");
      }
      return send(404, "not found", "text/plain");
    } catch (err) {
      return json(500, { error: (err as Error).message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 8787, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}/`;
      if (opts.open) openBrowser(url);
      resolve({ server, url, close: () => new Promise((r) => { for (const j of jobs) if (j.status === "running") j.child?.kill("SIGINT"); server.close(() => r()); }) });
    });
  });
}

interface JobSpec { root: string; runsDir: string; task: string; model: string; k: number; concurrency: number; budget: number; safety: boolean; provider: string }

function newJob(o: JobSpec): Job {
  return {
    id: Math.random().toString(36).slice(2, 10), task: o.task, model: o.model, k: o.k, status: "queued", startedAt: new Date().toISOString(), log: [],
    cmd: `PASSK_MODEL=${o.model} ${o.provider === "scripted" ? "PASSK_PROVIDER=scripted " : ""}npm run passk run tasks/${o.task}.yaml -- --k ${o.k} --concurrency ${o.concurrency} --budget ${o.budget}`,
  };
}

function startJob(o: JobSpec, job: Job, onExit: () => void): Job {
  const args = ["tsx", "src/cli.ts", "run", `tasks/${o.task}.yaml`, "--k", String(o.k), "--concurrency", String(o.concurrency), "--budget", String(o.budget)];
  const env: NodeJS.ProcessEnv = { ...process.env, PASSK_MODEL: o.model, PASSK_PROVIDER: o.provider, PASSK_RUNS_DIR: o.runsDir, PASSK_SAFETY: o.safety ? "allow" : "deny" };
  if (o.provider === "scripted") { delete env.PASSK_MODEL; env.PASSK_CLASSIFY = "0"; }
  job.status = "running"; job.phase = "starting"; job.startedAt = new Date().toISOString();
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, { cwd: o.root, env, stdio: ["ignore", "pipe", "pipe"] });
  job.child = child;
  const onLine = (line: string) => {
    if (!line.trim()) return;
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
    if (/^booting /.test(line)) job.phase = "preparing the snapshot";
    if (/^snapshot /.test(line)) job.phase = "snapshot saved";
    const dir = line.match(/^→ (.+)$/);
    if (dir) { job.dir = dir[1].trim(); job.href = `/runs/${path.basename(job.dir)}/report.html`; job.phase = "running"; }
  };
  let buf = "";
  const feed = (chunk: Buffer) => { buf += chunk.toString(); const lines = buf.split("\n"); buf = lines.pop() ?? ""; lines.forEach(onLine); };
  child.stdout?.on("data", feed);
  child.stderr?.on("data", feed);
  child.on("exit", (code) => {
    if (buf) onLine(buf);
    if (job.dir) job.progress = progressOf(job.dir) ?? job.progress;
    if (job.status !== "stopped") {
      if (code === 0 || code === 2) { job.status = "done"; job.phase = code === 2 ? "done · a gate was not met" : "done"; }
      else { job.status = "failed"; job.error = job.log.filter((l) => /error|Error|missing|failed/i.test(l)).slice(-1)[0] ?? `exit ${code}`; }
    }
    onExit();
  });
  return job;
}

/** A job's progress from the manifest its child process rewrites after every run. */
function progressOf(dir: string): Job["progress"] | undefined {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(dir, "bench.json"), "utf8")) as { runs: { status: string; usage: { costUsd?: number } }[] };
    return { done: b.runs.length, passed: b.runs.filter((r) => r.status === "passed").length, spent: b.runs.reduce((a, r) => a + (r.usage.costUsd ?? 0), 0) };
  } catch { return undefined; }
}

/** Merge keys into a .env file: replace a line that sets the key, append otherwise, leave everything else alone. */
export function writeEnv(file: string, pairs: [string, string][]): void {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  for (const [k, v] of pairs) {
    const i = lines.findIndex((l) => new RegExp(`^\\s*#?\\s*${k}\\s*=`).test(l));
    const line = `${k}=${v.trim()}`;
    if (i >= 0) lines[i] = line; else lines.push(line);
  }
  fs.writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 65536) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("invalid JSON")); } });
    req.on("error", reject);
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try { spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref(); } catch { /* the URL is printed anyway */ }
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".css": "text/css", ".js": "text/javascript", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };
