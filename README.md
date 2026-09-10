# Solari Cookbook

Short, runnable examples for [Solari](https://getsolari.com) — cloud browsers,
sandboxes, and desktops behind one API key.

Every example in this repo is a complete program you can run in under a minute.
They are deliberately small: one idea each, no framework, no scaffolding to read
past. Copy one into your project and change the parts you care about.

## Examples

### Cloud browser

| Example | Language | What it shows |
| --- | --- | --- |
| [browser-quickstart-ts](examples/browser-quickstart-ts) | TypeScript | Launch a browser, open a page, read it |
| [browser-quickstart-py](examples/browser-quickstart-py) | Python | Launch a browser, open a page, read it |
| [browser-stealth-proxy-ts](examples/browser-stealth-proxy-ts) | TypeScript | Stealth mode + residential proxy egress |
| [browser-profiles-ts](examples/browser-profiles-ts) | TypeScript | Log in once, reuse the session forever |
| [browser-session-recording-py](examples/browser-session-recording-py) | Python | Record a session, download the replay |

### Sandbox

| Example | Language | What it shows |
| --- | --- | --- |
| [sandbox-quickstart-ts](examples/sandbox-quickstart-ts) | TypeScript | Run a command, write and read files |
| [sandbox-code-interpreter-py](examples/sandbox-code-interpreter-py) | Python | Stateful Python kernel for agent loops |
| [sandbox-port-preview-ts](examples/sandbox-port-preview-ts) | TypeScript | Expose a server in the VM on a public URL |

### Desktop

| Example | Language | What it shows |
| --- | --- | --- |
| [desktop-computer-use-py](examples/desktop-computer-use-py) | Python | Screenshot, click, and type on a Linux GUI |

## passk — does your computer-use agent pass twice?

[`passk/`](passk/) is reliability regression testing for computer-use agents, built on
the desktop snapshot and fork APIs in this repo. It snapshots one desktop,
forks it *k* times, runs the same agent on every fork, verifies the outcome
inside the VM, and reports pass@k and pass^k with honest intervals. A
`compare` command puts two conditions from the same snapshot side by side.

Headline result so far, on the cheapest model available: an internal ticket
tool went 47/50 → 47/49 → 49/49 across three prompts on one snapshot, and the
bench explains why the middle one changed nothing. An accounts-payable entry
task (PDF → mock ERP, with a duplicate trap and forbidden buttons) scored
23/26 at 3.5 cents per success, failed attempts included. Every number is in
[`passk/evidence/`](passk/evidence/) with screenshots and traces; start at
[`passk/evidence/index.html`](https://tohirr.github.io/solari-cookbook/passk/evidence/index.html).

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-queue-baseline-vs-reload/compare.html"><img src="passk/docs/compare-ticket-queue.jpg" alt="passk comparison: three prompts on one snapshot" width="100%"></a></p>

## Running an example

Each directory is self-contained.

```bash
git clone https://github.com/solari-sdk/solari-cookbook.git
cd solari-cookbook/examples/browser-quickstart-ts

npm install                          # or: pip install -r requirements.txt
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
npm start                            # or: python main.py
```

One `slr_live_` key works across browsers, sandboxes, and desktops, and every
product bills to the same balance.

## Which product do I want?

- **Cloud browser** — you need a *web page*: scraping, testing, filling forms,
  anything Playwright or Puppeteer would do locally. Adds stealth, managed
  proxies, captcha solving, profiles, and session recording.
- **Sandbox** — you need to *run code*: an LLM's Python, an untrusted build, a
  data job. A headless microVM that boots from a snapshot in about a second.
- **Desktop** — you need a *screen*: computer-use agents, GUI apps, anything
  that has to be clicked. A sandbox plus X11 and a live VNC stream.

## Gotchas the examples encode

Things that cost you an afternoon if you meet them cold:

- **TypeScript: `browser.close()` is enough to exit (as of `@solarisdk/browser`
  0.1.3).** The client keeps a loopback proxy open for connection retries; before
  0.1.3 that listener held Node's event loop open, so you had to
  `await solari.close()` or the script printed its output and then hung forever.
  0.1.3 unrefs the listener — `browser.close()` alone now exits. Calling
  `solari.close()` is still fine and releases the client's pool immediately.
- **Recording is per session, not per account.** Pass `recording: true` when you
  create the session; without it the replay endpoint 404s forever. The upload is
  async after release, so poll for ~30s before giving up.
- **Sandbox commands are not shell-interpreted.** `run("ls -la")` looks for a
  binary named `ls -la`. Put argv in `args`, or run `sh -c` explicitly.
- **`kill()`, not `close()`, ends a VM.** `close()` drops your local control
  channel; the VM keeps running until its idle timeout.
- **`timeoutMs` is a rolling idle window**, not a hard deadline — it resets on
  every use.

## Links

- Docs — [docs.getsolari.com](https://docs.getsolari.com)
- Console — [console.getsolari.com](https://console.getsolari.com)
- Changelog — [changelog.getsolari.com](https://changelog.getsolari.com)
- Questions — [hello@getsolari.com](mailto:hello@getsolari.com)

## Contributing

New examples are welcome. Keep them small, make them run end-to-end against the
real API, and put anything surprising in a comment right where it bites.

MIT licensed.
