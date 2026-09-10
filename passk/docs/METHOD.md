# Method

How passk turns repeated runs into numbers you can act on, and what it refuses to claim. Companion to the [README](../README.md) and the [operator's manual](TASKS.md).

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

## Who gets blamed for what

A run that does not complete normally is put in one of four bins, and only
the first is scored against the agent:

| Kind | Meaning | Scored? |
|---|---|---|
| `agent` | the agent's own doing: gave up, malformed action, crashed on its own logic | yes, as a failure |
| `provider` | the model API failed after bounded retries (429, 5xx, connection) | no, listed as lost |
| `solari` | the desktop never came up, or its channel was lost | no, listed as lost |
| `verifier` | the checker itself could not run; the outcome is unknown | no, listed as lost |

Model calls retry up to three times with exponential backoff and jitter on
provider-side errors before a run is written off. A checker that cannot reach
the VM marks its check `errored`, and that run is a verifier loss, never an
agent failure. All lost runs count in end-to-end completion, so the report
always shows what the user got as well as what the agent did.

## How many runs, and what to change

Both are yours to decide. passk's job is to make each choice legible before
you pay for it, and to keep the experiment honest afterwards.

**How many runs.** Every run is one execution; a *condition* is k runs with
nothing changed between them. What an all-pass condition can establish:

| Runs per condition | Lower bound if every run passes | Good for |
|---:|---:|---|
| 3 | 44% | does the task work at all |
| 5 | 57% | choosing between two interventions |
| 10 | 72% | the configuration you keep |
| 35 | 90% | a "90% reliable" claim |
| 73 | 95% | a "95% reliable" claim |

`passk run` prints this for the k you chose, and with `--require-lower` it
refuses to start a sample that could not meet the requirement even if every
run passed. Start small, then extend: `--resume` with a larger `--k` adds
runs to a finished bench on the same snapshot.

**What to change.** Exactly one thing per experiment, on the same snapshot
with the same checks: a prompt, an environment detail, a model, a plan. The
failure evidence from the last bench says which. `passk recommend
runs/<dir>` reads a finished bench and suggests the category of the next
experiment with what to keep fixed; it is a recommendation, not a diagnosis,
and it will never rewrite your prompt or switch your model. Roughly:

| The evidence shows | Try next |
|---|---|
| failures reported success anyway | a verification step that reads state back, not a screenshot |
| runs interpreted the task differently | one clarification at a time (`passk probe` lists candidates) |
| same plan, environment flinched | an environment change, not a prompt change |
| same goal, different routes | a prompt that names the short strategy; compare effort and cost |
| every failure hit the step cap | a higher cap before blaming the agent |
| losses to infrastructure or the verifier | fix that first; the agent is not the variable |

**The loop that produced the results in `evidence/`:** validate the
verifier; run a baseline at k=3; read the failed runs; choose one
intervention; run A against B at k=5 each; compare pass rate, interval,
effort and cost; decide; run k=10 or more only for the configuration you
keep, and save it as the regression baseline. Nothing stops automatically:
the planned k and the completed count are both recorded, and stopping is
your call.

**Who decides what.** You: which workflow matters, what counts as success,
acceptable risk, budget, k, which change to test, whether to ship. passk:
equivalent runs, whether checks passed, intervals, whether a comparison
changed more than one thing, whether a claim exceeds the evidence, a
failure hypothesis, a suggested next experiment, and whether a gate passes.
Never passk: rewriting a prompt, switching a model, declaring anything safe
for production, or ignoring a failed check.

## Not a model benchmark

A benchmark asks which model is best across a fixed public task set and ends
in a score. passk asks whether *your* agent is dependable enough on *your*
workflow, and whether your latest change helped, and ends in a decision.
Every comparison in [`evidence/`](../evidence/) holds the model fixed and
changes something else: a folder, a sentence, a verification instruction.
The tasks that ship are examples of the format, not a canonical suite, and
there is no leaderboard. passk can compare two models on one snapshot the
way a test suite can compare two compilers; that is incidental, not the
point.

## Prior art, and where this differs

passk is a narrow tool assembled from ideas that exist elsewhere.

- **OSWorld** (Xie et al., 2024) established execution-based verification
  for computer-use agents: set an application up, let the agent act, read
  the resulting state. passk keeps that rule and drops the suite. OSWorld
  runs hundreds of tasks once each to produce a score; passk runs one task
  many times from one snapshot to produce a reliability figure and a reason
  for each failure, and it proves the verifier before trusting it.
- **Terminal-Bench** packages a task as an instruction, an isolated
  environment and a hidden test. passk's task file is the same shape, with
  the same rule that the agent never sees the checks and its own claim of
  success is never graded. The difference is again repetition from
  identical state rather than breadth.
- **hyperfine** repeats a command and reports a distribution instead of a
  single timing. passk asks hyperfine's question about success instead of
  speed: not "did it pass" but "how often, with what spread, and at what
  cost." The terminal summary, the explicit run count and the prepare step
  are borrowed from it.
- **k6** made "repeat the workload, set a threshold, fail the build" the
  normal way to test service reliability. `--require-lower` and `gate` are
  that idea for agents. If passk is like any product, it is k6 for
  computer-use agents, not a model leaderboard.
- **Pinetree, *On the Reliability of Computer Use Agents* (2026)** supplies
  the taxonomy the failure classifier sorts into: stochastic execution,
  task ambiguity, behavior variability.

What none of them have is the thing Solari makes cheap: a byte-identical
starting state for every attempt. Without it, repeated runs measure the
environment's drift as much as the agent's, and the numbers above would not
mean what they say.

## Safety checks

OpenAI's computer tool flags some actions as potentially consequential and
asks the caller to acknowledge them. passk **stops the run by default**
(`stoppedBy: "safety_check"`, scored as a failure with its reason). Set
`PASSK_SAFETY=allow` or pass `--safety allow` to acknowledge automatically.
That is only defensible inside a disposable VM with no route to real
systems, which is what every bench in this repo is, and nowhere else.

## When a bench dies halfway

Every run writes its own `run.json` the moment it finishes, and the bench's
`bench.json` is written before the first fork and rewritten after every run,
with `status: "running"` until the end. If the process dies at run 43 of 50
(laptop sleep, network loss, a provider outage), the 43 verified runs are on
disk and:

```bash
npm run passk run tasks/ticket-queue.yaml -- --k 50 --resume
```

finds the newest unfinished bench for that task and executes only the
missing indices. Nothing runs twice; infrastructure losses are recorded at
their index so a resume does not quietly retry them and shift the sample.
`report`, `gate` and `compare` work on a partial bench at any time.

## Testing the harness without a VM or a model

`PASSK_PROVIDER=scripted` swaps in an in-memory desktop and a scripted agent
whose behavior per run comes from `PASSK_SCRIPT`:

```bash
PASSK_PROVIDER=scripted PASSK_SCRIPT="pass*15,fail*3,hang,claim_only" \
  npm run passk run tasks/fake.yaml -- --k 20
```

Behaviors: `pass`, `fail` (wrong state, claims success), `claim_only`
(no state change, claims success), `hang` (runs to the step cap),
`provider_err` (the model API fails), `crash_after` (task done, agent dies),
`slow`. The real runner, checker, metrics, persistence and report run
unchanged, so `test/resume.test.ts` can kill a 20-run bench halfway and
resume it, prove no index ran twice, check every stop reason is accounted
for, enforce a budget, and push 200 runs through at concurrency 16 in a few
seconds, all for no money.
