# passk

**Does your computer-use agent pass twice?**

> **Status: built in public, evidence published.** Nine tasks across three
> Solari templates, 250+ verified runs, one controlled three-way experiment,
> and a mock accounts-payable workflow, all on a budget model for under $4 of
> model spend. Every number is in [`evidence/`](evidence/) with screenshots
> and traces. The Claude agent loop is written but unexercised for want of a
> working key; the OpenAI loop produced everything here.

`passk` forks one Solari desktop snapshot *k* times, runs the same task on every
fork with the same agent, and tells you two things a single demo never will:

1. **pass^k** — the probability that *all k* attempts succeed. This is the number
   a user feels. An agent at 80% pass@1 is at 33% pass^5.
2. **Why the failures happened** — each failing run is diffed against a passing
   sibling to find the first step where they diverge, then sorted into one of the
   three sources of unreliability from Pinetree's *On the Reliability of Computer
   Use Agents* (2026): stochastic execution, task ambiguity, or behavior
   variability.

It also ships a **probe**: before spending k runs, fork one throwaway desktop, let
the agent look around, and have it list every question it would ask a human.
Tighten the prompt, re-probe, then bench.

Built on Solari because it is the only place this is cheap: `snapshot()` once,
`createDesktop({ fromSnapshot })` k times, every fork boots byte-identical in
about a second.

## Quick start

```bash
cd passk
npm install
cp .env.example .env        # SOLARI_API_KEY + ANTHROPIC_API_KEY or OPENAI_API_KEY

npm run passk prepare tasks/notes.yaml         # boot → setup → snapshot
npm run passk probe   tasks/notes.yaml         # what would the agent ask?
npm run passk run     tasks/notes.yaml -- --k 5
open runs/notes-*/report.html
```

Concurrency defaults to 2 (the Starter plan's sandbox limit). Professional
allows 10: `PASSK_CONCURRENCY=10`.

```bash
npm run passk run tasks/notes.yaml -- --k 10 --budget 0.50     # stop launching runs at $0.50 of model spend
npm run passk run tasks/notes.yaml -- --k 10 --require 0.9     # exit 2 unless observed pass@1 ≥ 90%
npm run passk gate runs/notes-*/ -- --require-lower 0.7        # same gate on a saved bench, for CI
```

## Change one thing, measure again

The bench is the instrument; the experiment is the point. Fork the same
snapshot under two conditions, then compare:

```bash
npm run passk run tasks/rename-invoices.yaml -- --k 5                       # ambiguous prompt
npm run passk run tasks/rename-invoices-clarified.yaml -- --k 5 --snapshot snap_…   # clarified prompt, same snapshot
npm run passk compare runs/rename-invoices-*/ runs/rename-invoices-clarified-*/
```

`compare` says what was held fixed (snapshot, checks, model), what changed
(prompt, environment), the observed delta in passes, steps, time and cost per
success, and Fisher's exact p-value for the pass/fail split. It refuses to
attribute a difference when more than one thing changed. Note how little
small samples can prove: 4/10 against 9/10 looks decisive and is p = 0.057.

## Reading the numbers honestly

Ten passes out of ten is an observation, not a proof of 100% reliability. Every
bench reports the observed count, a 95% Wilson interval on the pass rate (10/10
puts the lower bound near 72%), and pass^k both as a point estimate and as that
lower bound raised to the k. Two denominators are kept: **pass@1** is passes
over runs the agent actually attempted, and **end-to-end** is passes over the
runs you asked for, so a fork that never booted counts against the
infrastructure but not against the agent. Failure causes are labelled as
hypotheses with a confidence, and when no run passed there is nothing to
diverge from, so they are capped at low confidence. Every `bench.json` carries
the full task definition, a hash of it, and the model, package and commit
versions that produced it.

## Writing a task

```yaml
id: notes
name: Save a note in Mousepad
template: default          # default | office | code | your custom template
setup:                      # runs once, before the snapshot
  - open: mousepad
  - wait: 4
prompt: >                   # exactly what a user would type
  Type "hello" and save it as notes.txt in Documents.
checks:                     # evaluated INSIDE the desktop after the agent stops
  - type: file_contains
    path: /home/user/Documents/notes.txt
    text: hello
```

Setup steps: `exec` (argv, no shell), `open` (launch a GUI app by name),
`write` (text to a guest path), `upload` (local file to a guest path), `click`
(x, y), `press` (a key or "+"-joined chord), `type` (literal text), `wait`
(seconds). Everything runs once, before the snapshot, so forks pay none of it.

Check types: `file_exists`, `file_contains`, `file_equals`, `exec` (exit code +
stdout), `screenshot_judge` (the model grades the final screen against a rubric).

## Evidence

[`evidence/`](evidence/) holds every bench cited in this README: `bench.json`
with every action, check, provenance record and task hash; the report page;
the final screenshot of every run; and every screenshot of every failed run
and of the shortest passing run. Comparison folders hold the paired results.
`sh scripts/curate-evidence.sh` rebuilds it from `runs/`.

## Tasks that ship

| Task | Template | What it exercises |
|---|---|---|
| `notes` / `notes-nodir` | default | Save-dialog handling; an environment pair (folder present vs missing) |
| `rename-invoices` / `-clarified` | default | File manager; a prompt pair (ambiguous vs spelled out) |
| `q3-total` | office | LibreOffice Calc, formulas, the CSV "keep format" dialog |
| `ticket-queue` / `-verify` / `-reload` | default | An internal web tool served from inside the VM: no login, no proxy, state in a JSON file the checker reads. One of the customer's tickets is closed and must not be touched. Three prompt conditions on one snapshot. |
| `invoice-entry` | office | Accounts payable: read a PDF from Incoming, enter it into LedgerDesk (a mock AP tool served from inside the VM), attach the file, save as Pending review. A duplicate trap, a wrong-vendor decoy, and Approve/Pay buttons that must stay untouched. Verified against the ledger, including the attachment's sha256. |

LedgerDesk and the ticket queue are mocks on purpose. A mock lets the bench
own the state, plant a trap, and verify exactly. What they keep from the real
thing is the shape: existing records to search, a duplicate to avoid, required
fields, dropdowns, a file upload, a business rule ("pending review"), and a
consequential action that must not happen.

The ticket queue is the shape of task Pinetree describes: a proprietary
dashboard with no API. Because the app lives in the snapshot, fifty runs cost
about a dollar on a budget model.

## How it works

```
prepare   boot template ──▶ run setup ──▶ snapshot ──▶ kill
run       fork ×k from snapshot ──▶ agent loop on each ──▶ checks ──▶ kill
          ──▶ pass@k / pass^k ──▶ diff failing traces vs passing ──▶ classify ──▶ report.html
```

- `src/agent/anthropic.ts` — Claude computer-use loop (`computer_toolset_20260801`).
- `src/agent/openai.ts` — GPT-5.x loop via the Responses API `computer` tool.
  `PASSK_PROVIDER` picks one; add a file to `src/agent/` to bench your own agent.
- `src/llm.ts` — provider-neutral structured-output call used by the judge,
  the classifier and the probe, so a bench never mixes models.
- `src/agent/computer.ts` — maps computer-use actions onto Solari's desktop RPCs.
- `src/metrics.ts` — unbiased pass@k and pass^k estimators.
- `src/classify.ts` — divergence point + cause classification.
- `src/probe.ts` — the ambiguity dry-run.

## Gotchas learned on a live VM

- **Key chords must be one string.** `keyboard.press(["ctrl", "s"])` presses
  ctrl, then s, and you get a literal "s". `keyboard.press("ctrl+s")` is the
  chord. `keyboard.hotkey("ctrl", "s")` has the same bug. `down`/`up` do hold
  modifiers correctly. Key names are xdotool's: `Return`, `BackSpace`,
  `Page_Down` — not `enter`.
- **Home is `/home/desktop`, and GUI apps run as root.** Mousepad shows a red
  root warning; file dialogs default to `/home/desktop`. `exec` runs with an
  empty `$HOME`, so use absolute paths in setup and checks.
- **The SDK's `mouse.scroll` has no direction.** X11 scroll is buttons 4–7 and
  the typed `MouseButton` can't express them, so passk scrolls through
  `xdotool click 4|5|6|7`, which the default template ships.
- **`sandboxes.createDesktop`, not `desktops.create`, for forks.** Only the
  sandbox-flavoured route accepts `fromSnapshot`.
- **Lowercase the letters in chords.** `ctrl+A` reaches xdotool as
  ctrl+shift+a, which in Chrome opens the tab-search panel and silently
  swallows everything typed next. One capital letter cost a whole run.
- **The control channel can drop right after a fork** on the office template:
  up for `connect()` and `health()`, gone by the first action. passk reconnects
  once and retries the action instead of failing the run.
- **Chrome will not upload a file from `/root`.** A form with a file input
  chosen from under `/root` fails with `ERR_ACCESS_DENIED` on submit and never
  reaches the server; the same file under `/home/desktop` or `/tmp` uploads
  fine. Put task inputs the agent must attach under the desktop user's home.
- **Verify the verifier.** An `exec` check that ran `cat` on two candidate
  paths failed with exit 1 whenever the first path was missing, even though the
  second printed the right text. Two real passes were scored as failures until
  the forensics in the report showed the file sitting exactly where it should
  be. `exec` checks with `stdout_contains` now judge output only unless an
  `exit_code` is given.
- **Clipboard readback is empty** (`xclip -o` exits 1) even after a real copy.
  Verify results through the filesystem instead.
