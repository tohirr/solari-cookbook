# passk

**Does your computer-use agent pass twice?**

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

Check types: `file_exists`, `file_contains`, `file_equals`, `exec` (exit code +
stdout), `screenshot_judge` (Claude grades the final screen against a rubric).

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
- **Clipboard readback is empty** (`xclip -o` exits 1) even after a real copy.
  Verify results through the filesystem instead.

## Status

Runs end to end on Solari with the OpenAI agent. Claude loop is written but
untested (no working Anthropic key yet).
