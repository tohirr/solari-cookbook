# passk

**Does your computer-use agent pass twice?**

An agent that passes a demo once tells you nothing about the tenth try. passk
snapshots one Solari desktop, forks it *k* times, runs the same agent on every
fork, verifies the outcome inside the VM, and reports pass@k and pass^k with
honest intervals, plus the step where each failure parted ways with a passing run.

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-routing-prompt/compare.html"><img src="docs/compare-ticket-routing.jpg" alt="A passk comparison page: one task under two prompts on the same snapshot, the outcome dots for each side, the deltas in passes, effort and cost, and a by-check table showing which rules moved" width="100%"></a></p>

The bench is the instrument; the experiment is the point. Fork one snapshot
under two conditions, a prompt, a folder, a model, and `compare` puts them
side by side: what was held fixed, what changed, the delta in passes, effort
and cost per success, the same delta per check, and Fisher's exact p for the
pass/fail split. It refuses to attribute a difference when more than one
thing changed, and it says when a sample is too small to say anything.

The picture above is one such comparison from the benches in `evidence/`,
which were run while building the tool, on one budget model at small *k*.
Read them as a demonstration of what the pages contain, not as findings;
they will be re-run.

**[An example comparison](https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-routing-prompt/compare.html)
· [Every bench and screenshot](https://tohirr.github.io/solari-cookbook/passk/evidence/index.html)
· [How it works](docs/TASKS.md#what-run-does)
· [The method](docs/METHOD.md)
· [Notes for Solari's team](docs/SOLARI-NOTES.md)**

## One command

No keys, forty seconds, the whole pipeline on in-memory desktops:

```bash
git clone https://github.com/tohirr/solari-cookbook.git && cd solari-cookbook/passk && npm install
PASSK_PROVIDER=scripted npm run passk run tasks/fake.yaml -- --k 10
```

<p align="center"><img src="docs/demo.gif" alt="Terminal recording: passk snapshots the task, proves the verifier, forks ten desktops, grades each run, prints pass@1 with its interval and pass^k, and the gate refuses an 80% agent" width="100%"></p>

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

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/index.html"><img src="docs/failure-ticket-routing.jpg" alt="Failure evidence: a passing run and a failing run of the routing task on one time axis, the first divergent step, the agent's claim of success, and the checker's MISMATCH from inside the VM" width="100%"></a></p>

## Evidence

[`evidence/`](evidence/) holds every bench run so far: eleven tasks across
three Solari templates, prompt pairs and an environment pair on one snapshot,
and a mock accounts-payable workflow with a duplicate trap, each with its
bench file, the checks as run, screenshots and traces, rendered at
[the showcase](https://tohirr.github.io/solari-cookbook/passk/evidence/index.html).
They were run while building the tool, on one budget model at small *k*:
a demonstration of what a bench and a comparison contain, not a result about
any model. The Claude loop has not been benched yet.

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
npm run passk export-inspect runs/dir      # the bench as an Inspect AI log, next to it, for `inspect view`
```

## Docs

- [Writing and running tasks](docs/TASKS.md): setup, the task format, the shipped tasks, experiments, benching your own agent, scope.
- [Method](docs/METHOD.md): intervals, who gets blamed for what, how many runs, resume, testing the harness, safety.
- [Notes from building on Solari](docs/SOLARI-NOTES.md): the gotchas, for Solari's team as much as for users.
- [Evidence](evidence/README.md): every bench, every comparison, every screenshot that carries proof.
