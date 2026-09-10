# passk

**Does your computer-use agent pass twice?**

An agent that passes a demo once tells you nothing about the tenth try. passk
snapshots one Solari desktop, forks it *k* times, runs the same agent on every
fork, verifies the outcome inside the VM, and reports pass@k and pass^k with
honest intervals, plus the step where each failure parted ways with a passing run.

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-queue-baseline-vs-reload/compare.html"><img src="docs/compare-ticket-queue.jpg" alt="Three prompts, one snapshot: 47/50, 47/49, 49/49" width="100%"></a></p>

Three prompts, one snapshot, the cheapest model available: 47/50, 47/49, 49/49.
The baseline's three failures were one thing, a Save click that did not land
followed by a confident claim of success. Asking the agent to verify changed
nothing, because the screen shows the new value whether or not it was saved.
Asking it to reload forced a read from the server, and no run failed. On this
many runs the pass/fail split alone is still consistent with noise (p = 0.24);
the mechanism is the evidence, and the interval says so.

**[The comparison](https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-queue-baseline-vs-reload/compare.html)
· [Every bench and screenshot](https://tohirr.github.io/solari-cookbook/passk/evidence/index.html)
· [How it works](docs/TASKS.md#what-run-does)
· [Notes for Solari's team](docs/SOLARI-NOTES.md)**

## One command

No keys, forty seconds, the whole pipeline on in-memory desktops:

```bash
git clone https://github.com/tohirr/solari-cookbook.git && cd solari-cookbook/passk && npm install
PASSK_PROVIDER=scripted npm run passk run tasks/fake.yaml -- --k 10
```

The real thing, with a [Solari key](https://console.getsolari.com) and an
OpenAI or Anthropic key in `.env` (copy `.env.example`; `doctor` checks both):

```bash
npm run passk doctor
npm run passk run tasks/ticket-queue.yaml -- --k 10
open runs/ticket-queue-*/report.html
```

`run` does everything. It boots the template and runs the task's setup once,
snapshots it, proves the verifier on one fork (the checks must fail on the
untouched state and pass after the task's golden steps, or the bench does not
start), forks the snapshot *k* times, runs the agent on every fork, grades each
run inside its own VM, and writes the report. Fifty runs of the ticket queue
cost about a dollar on a budget model.

<p align="center"><img src="docs/how-it-works.jpg" alt="How passk works: task and verifier, prepare one Solari desktop, snapshot, validate the verifier, fork k times, agent and checks on each fork, reliability report" width="100%"></p>

## What the report says

- **Observed passes with a 95% interval.** 10/10 is a lower bound of 72%, not proof of 100%.
- **pass^k**, the chance all *k* attempts in a row succeed. 80% pass@1 is 33% pass^5. This is the number a user feels.
- **For each failure**, the first step where it diverged from a passing sibling, and a cause hypothesis: stochastic execution, task ambiguity, or behavior variability.
- **Steps, seconds and model spend** per run, and cost per success.
- **Runs lost to infrastructure**, listed but never scored against the agent.
- **Every screenshot, every action, the checks as run**, and a hash of the task, so the number is auditable.

Nothing the agent says about its own success counts. Grading happens inside the VM after it stops.

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/index.html"><img src="docs/failure-ticket-queue.jpg" alt="Failure evidence: a passing run and a failing run of the ticket queue on one time axis, the first divergent step, the agent's claim of success, and the checker's MISMATCH from inside the VM" width="100%"></a></p>

## Evidence

Nine tasks across three Solari templates, 250+ verified runs, one controlled
three-way experiment, a mock accounts-payable workflow with a duplicate trap,
all for under $4 of model spend. Every number is in
[`evidence/`](evidence/) with screenshots and traces, rendered at
[the showcase](https://tohirr.github.io/solari-cookbook/passk/evidence/index.html)
and summarized on [the front page](https://tohirr.github.io/solari-cookbook/passk/).

## Write your own task

```yaml
id: notes
name: Save a note in Mousepad
setup:                      # runs once, before the snapshot
  - open: mousepad
  - wait: 4
prompt: >                   # exactly what a user would type
  Type "hello" and save it as notes.txt in Documents.
golden:                     # the correct outcome with no agent, so run can prove the checks
  - write: /root/Documents/notes.txt
    content: hello
checks:                     # graded inside the desktop after the agent stops
  - type: file_contains
    path: /root/Documents/notes.txt
    text: hello
```

Anything whose state lives inside the desktop works: desktop applications,
files and PDFs, a web tool served from inside the VM. Setup can exec, upload,
open apps, click and type; checks can read files, run any command, or as a
last resort have the model judge the final screen. The format, the shipped
tasks, and what is out of scope are in [the operator's manual](docs/TASKS.md).

## After the first bench

```bash
npm run passk compare runs/A runs/B        # what changed, what moved, and whether it could be noise
npm run passk gate runs/dir -- --require-lower 0.7   # exit 2 in CI if a saved bench misses the bar
npm run passk probe tasks/x.yaml           # what would the agent ask a human before acting?
npm run passk recommend runs/dir           # what to change next, and what to keep fixed
npm run studio                             # the leaderboard on localhost, with a Run button
```

## Docs

- [Writing and running tasks](docs/TASKS.md): setup, the task format, the shipped tasks, experiments, benching your own agent, scope.
- [Method](docs/METHOD.md): intervals, who gets blamed for what, how many runs, resume, testing the harness, safety.
- [Notes from building on Solari](docs/SOLARI-NOTES.md): the gotchas, for Solari's team as much as for users.
- [Evidence](evidence/README.md): every bench, every comparison, every screenshot that carries proof.
