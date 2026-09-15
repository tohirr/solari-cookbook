# passk

**Does your computer-use agent pass twice?**

I have a small app, [bookmarx](https://bookmarx.space), that searches my saved
posts. Before the library went public I wanted the awkward things out of it, so
there is an agent that walks a review queue and presses Remove or Keep on each
post: nine to remove under a rubric, eight guards that only look risky. It
works. I have watched it work.

Ten forks of one desktop say it works **four times in ten**.

Fifteen of its nineteen rules hold on every run. The one that doesn't is the
hateful post — removed in half the runs, kept in the other half, in two
independent samples of ten. Watching it once told me none of that. A single run
passes 40% of the time, and when it passes it looks reliable.

That gap — between an agent that works while you watch and an agent that works
— is what passk measures. It snapshots one [Solari](https://getsolari.com)
desktop, forks it *k* times, runs the same agent on every fork, and grades each
run by reading state **inside the VM** after the agent stops. Nothing the agent
says about its own success counts.

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/compare-bookmarx-triage-prompt/compare.html"><img src="docs/compare-bookmarx-triage.jpg" alt="A passk comparison page for a real app: bookmarx's sweeping agent reviewing a queue of seventeen saved posts under two prompts, 4/10 against 2/10, with the by-check table showing fifteen of nineteen rules holding every run and the hateful post removed in half" width="100%"></a></p>

## The loop

```bash
passk run tasks/my-task.yaml --k 10        # fork ×10, run, grade inside the VM, report
passk compare runs/A runs/B                # change one thing; did reliability move, or is it noise?
passk gate  runs/dir --require-lower 0.7   # exit 2 when a saved bench misses the bar
```

Every attempt starts byte-identical, which is the whole reason the numbers mean
anything: repeated runs measure the agent, not the environment drifting under
it. It is also why ten runs cost cents — a fork boots from the snapshot in about
a second.

## In your agent's CI

```yaml
- uses: tohirr/solari-cookbook/passk@v0.2
  with:
    task: tasks/triage.yaml
    agent: agents/triage.ts   # your agent; omit to use passk's reference loops
    k: 10
    require-lower: 0.7        # fail unless the 95% lower bound on the pass rate clears 70%
  env:
    SOLARI_API_KEY: ${{ secrets.SOLARI_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}    # or ANTHROPIC_API_KEY
```

The runner needs no display; the desktops are Solari's. A push that edits a
prompt, a triage page or a card component re-benches the agent and fails the
build when reliability drops. The job summary carries the verdict, every run as
a glyph, the interval, the checks that missed and the failed runs; the artifact
carries the full report. Every input and output is in
[`action.yml`](action.yml), and [this repo's own workflow](../.github/workflows/passk.yml)
runs the action on every push, so it is proven here before you use it.

`agent:` points at any module that takes a live desktop handle and a prompt and
returns what it did — the contract is in
[the manual](docs/TASKS.md#benching-your-own-agent). Two rules are not
negotiable: the agent never sees the task's checks, and its own claim of
success is recorded but never graded.

## Try it with no keys

Forty seconds, the whole pipeline on in-memory desktops:

```bash
git clone https://github.com/tohirr/solari-cookbook.git && cd solari-cookbook/passk && npm install
PASSK_PROVIDER=scripted npm run passk run tasks/fake.yaml -- --k 10
```

<p align="center"><img src="docs/demo.gif" alt="Terminal recording: passk snapshots the task, proves the verifier, forks ten desktops, grades each run, prints pass@1 with its interval and pass^k, and the gate refuses an 80% agent" width="100%"></p>

The real thing needs a [Solari key](https://console.getsolari.com) and an OpenAI
or Anthropic key in `.env` (copy `.env.example`; `doctor` checks both):

```bash
npm run passk doctor
npm run passk run tasks/ticket-queue.yaml -- --k 10
open runs/ticket-queue-*/report.html
```

## A task is ten lines of YAML

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
open apps, click and type; checks read files, run commands, or as a last
resort have the model judge the final screen. Before any agent runs, the
checks must fail on the untouched snapshot and pass after the golden steps, or
the bench refuses to start — an unsound verifier makes every number after it
meaningless. The format, the shipped tasks and what is out of scope are in
[the manual](docs/TASKS.md).

## What you get back

- **Observed passes with a 95% interval.** 10/10 is a lower bound of 72%, not proof of 100%.
- **pass^k**, the chance all *k* attempts in a row succeed. 80% pass@1 is 33% pass^5. This is the number a user feels.
- **Per check, how often each rule was met**, so a pass rate becomes a diagnosis rather than a verdict.
- **For each failure**, the first step where it diverged from a passing run, and a cause hypothesis.
- **Steps, seconds and model spend** per run, and cost per success with the failed attempts counted.
- **Runs lost to infrastructure**, listed and never scored against the agent.
- **Runs that stopped early**, marked when a run stops by itself far under the bench's typical effort: not the same failure as working to the step cap and getting it wrong.
- **Every screenshot, every action, the checks as run**, and a hash of the task, so the number is auditable — plus any file the task names as `evidence`, copied out of each fork before it is killed.

A task whose screens carry real content declares `screenshots: private`, and one
whose evidence names real things declares `labels`; then no frame and no
identifier leaves the run, and the export refuses if one slips through. That is
how the bookmarx bench above is published: the numbers and the decisions, with
every post id replaced by `target 6 (hateful)`, `guard 5`, `library post 212`.

<p align="center"><a href="https://tohirr.github.io/solari-cookbook/passk/evidence/index.html"><img src="docs/failure-ticket-routing.jpg" alt="Failure evidence: a passing run and a failing run of the routing task on one time axis, the first divergent step, the agent's claim of success, and the checker's MISMATCH from inside the VM" width="100%"></a></p>

## Change one thing, compare

```bash
npm run passk run tasks/bookmarx-triage.yaml -- --k 10
npm run passk run tasks/bookmarx-triage-keep.yaml -- --k 10 --snapshot snap_…   # same snapshot
npm run passk compare runs/bookmarx-triage-2*/ runs/bookmarx-triage-keep-*/
```

`compare` puts two conditions from one snapshot side by side: what was held
fixed, what changed, the delta in passes, effort and cost per success, the same
delta per check, and Fisher's exact p for the pass/fail split. It refuses to
attribute a difference when more than one thing changed, and it says when the
sample is too small to say anything.

Adding *"when you are unsure about a post, keep it"* to the sweeping agent's
prompt gave 2/10 against the baseline's 4/10 — a split **consistent with noise**
(p = 0.63). Worth knowing, and worth not shipping a claim about.

The first version of that comparison read 4/10 against 0/10 and looked like one
sentence breaking the agent. Two of those ten runs were network failures the
agent had reported as its own faults, and passk scored them against it. With the
classification fixed and a fresh sample, the effect was gone. The instrument
caught its own artifact, which is the point of having one.

The second example is a mock rather than a real app: an internal ticket queue
served from inside the VM, twelve tickets and nineteen checks, one sentence
added to the prompt.
[That comparison](https://tohirr.github.io/solari-cookbook/passk/evidence/compare-ticket-routing-prompt/compare.html)
went 5/18 to 14/20 and the table says which rows the sentence fixed and which it
cost. It was run while building the tool, on one budget model, and is a
demonstration of what the pages hold rather than a finding.

## Twelve things learned about Solari

Everything in [`docs/SOLARI-NOTES.md`](docs/SOLARI-NOTES.md) was found on a live
VM while building this, and cost an afternoon each. Among them: `snapshot()` can
return an id before the snapshot exists, so a fork from it boots and then hangs
on its first `exec`; `keyboard.press(["ctrl","s"])` types a literal "s" instead
of sending the chord; Chrome will not upload a file from under `/root`. Solari's
team may find the first four worth a changelog entry.

## How this differs from other agent tests

[EvalView](https://github.com/hidai25/eval-view) snapshots a chat agent's
tool-call trajectory and diffs it; the Azure and Bedrock evaluation actions
score a chat agent's answers with an LLM judge. passk is for agents that drive a
screen, it verifies the world rather than the transcript, and every run starts
from the same bytes, which is what makes *k* attempts comparable and pass^k
meaningful. The method, the intervals and the paper the question comes from are
in [Method](docs/METHOD.md).

## After the first bench

```bash
npm run passk compare runs/A runs/B        # what changed, what moved, and whether it could be noise
npm run passk gate runs/dir -- --require-lower 0.7   # exit 2 in CI if a saved bench misses the bar
npm run passk export-inspect runs/dir      # the bench as an Inspect AI log, next to it, for `inspect view`
```

## Docs

- [Manual](docs/TASKS.md): setup, the task format, what `run` does, the shipped tasks, experiments, benching your own agent, scope.
- [Method](docs/METHOD.md): intervals, who gets blamed for what, how many runs, resume, testing the harness, safety.
- [Notes from building on Solari](docs/SOLARI-NOTES.md).
- [Evidence](evidence/README.md): both worked examples, with every file that carries proof.
