# passk — does your computer-use agent pass twice?

An agent that passes a demo once tells you nothing about the tenth try.
passk snapshots one [Solari](https://getsolari.com) desktop, forks it *k*
times, runs the same agent on every fork, grades the outcome **inside the
VM** after the agent stops, and reports pass@k and pass^k with honest
intervals. Nothing the agent says about its own success counts.

passk exists for one question: when your agent works, how often does it
work? A single pass is one draw from a distribution. Solari's snapshot and
fork make the rest of the draws cheap: every attempt starts from a
byte-identical desktop, so fifty runs of a task cost about a dollar on a
budget model, and the spread you measure is the agent's, not the
environment's.

What a bench reports, and what a comparison adds:

- **pass@1 with a 95% interval, and pass^k**, the chance that *k* attempts in
  a row all succeed, which is the number a user feels.
- **A verifier proven before any agent runs.** The checks must fail on the
  untouched snapshot and pass after the task's golden steps, or no bench.
- **Per check, how often each rule was met**, so a pass rate becomes a diagnosis.
- **For each failure**, the first step where it parted from a passing run and
  a hypothesis for why.
- **Runs lost to infrastructure**, listed and never scored against the agent.
- **`compare`**: two conditions on one snapshot, what was held fixed, what
  changed, the per-check deltas, and Fisher's exact p, so you learn whether a
  change moved anything or the sample was too small to say.

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-routing-prompt/compare.html"><img src="passk/docs/compare-ticket-routing.jpg" alt="A passk comparison page: one task under two prompts on the same snapshot, the outcome dots for each side, the deltas in passes, effort and cost, and a by-check table showing which rules moved" width="100%"></a></p>

**[An example comparison](https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-routing-prompt/compare.html)
· [Every bench and screenshot](https://tohirr.github.io/solari-cookbook/passk/evidence/index.html)
· [How it works](passk/docs/TASKS.md#what-run-does)
· [The method](passk/docs/METHOD.md)
· [Notes for Solari's team](passk/docs/SOLARI-NOTES.md)**

The benches published so far were run while building the tool, on one budget
model at small *k*. They are there to show what the pages contain, not as
findings about any model, and they will be re-run. Every number on them links
to its bench file, the checks as run, and the screenshots.

The question is from Gonzalez-Pumariega et al., [*On the Reliability of
Computer Use Agents*](https://arxiv.org/abs/2604.17849) (2026), which
measures it on OSWorld. passk measures it on *your* workflow, and Solari's
snapshot-and-fork is what makes every attempt start byte-identical and
fifty runs cost about a dollar.

No keys, forty seconds, the whole pipeline on in-memory desktops:

```bash
git clone https://github.com/tohirr/solari-cookbook.git && cd solari-cookbook/passk && npm install
PASSK_PROVIDER=scripted npm run passk run tasks/fake.yaml -- --k 10
```

The real thing needs a Solari key and an OpenAI or Anthropic key; start at
[`passk/README.md`](passk/README.md).

---

## The Solari cookbook

This repository is a fork of
[solari-sdk/solari-cookbook](https://github.com/solari-sdk/solari-cookbook),
short runnable examples for Solari's cloud browsers, sandboxes, and desktops.
The examples below are the upstream ones, unchanged; passk is built on the
desktop snapshot and fork APIs they introduce.

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
