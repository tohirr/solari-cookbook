# Writing and running tasks

The operator's manual: setup, the task format, what `run` does, the shipped tasks, experiments, benching your own agent, and what is in and out of scope. Companion to the [README](../README.md) and [Method](METHOD.md).

## Setup

You need Node 20 or newer, a Solari account, and one model key.

```bash
git clone https://github.com/tohirr/solari-cookbook.git
cd solari-cookbook/passk
npm install
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where it comes from |
|---|---|
| `SOLARI_API_KEY` | [console.getsolari.com](https://console.getsolari.com) → API keys. The free tier allows 1 concurrent desktop; Starter allows 2 and includes $20 of credit. |
| `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY` | Your model provider. With both set, Claude is used unless `PASSK_PROVIDER=openai`. |
| `PASSK_MODEL` | Optional. `gpt-5.6-luna` is the budget tier every result here was produced on; leave unset for the provider's default. |
| `PASSK_SAFETY=allow` | Set this for benches: it lets the OpenAI loop acknowledge its own safety checks inside the disposable VM. Never set it anywhere real. |
| `PASSK_CONCURRENCY` | Optional. Defaults to 2. Match your Solari plan. |

Then confirm everything talks to everything:

```bash
npm run passk doctor
```

It checks the keys, reaches Solari, boots and kills one desktop, sends the
model a one-token request, and prints what a run would use. Fix anything it
marks ✗ before going further. The commands in these docs are written as
`passk …`; run them as `npm run passk -- …` or set `alias passk="npx tsx src/cli.ts"`
inside the `passk/` folder.

Results land in `runs/<task>-<timestamp>/` (ignored by git); the curated,
committed copies live in [`evidence/`](../evidence/).

The Claude agent loop is written but was not exercised during development
for want of a working key; every published result came from the OpenAI loop.

## In CI

The GitHub Action runs `passk run` on a runner with no display; the desktops
are Solari's. Secrets arrive as `env`, never as inputs.

```yaml
- uses: tohirr/solari-cookbook/passk@v0.2
  with:
    task: tasks/ticket-queue.yaml     # path in your repo, or passk:tasks/… for one of passk's own
    k: 10
    require-lower: 0.7                # or require: 0.9 for the observed rate
    provider: openai                  # anthropic | openai | scripted; default picks from the keys present
    concurrency: 2                    # match your Solari plan
    budget: 1                         # stop launching runs at $1 of model spend
    snapshot: snap_…                  # optional: fork this snapshot instead of preparing one
    classify: "false"                 # a cause hypothesis per failed run costs model calls
    # agent: src/my-agent.ts          # bench your own agent instead of passk's loops (see below)
  env:
    SOLARI_API_KEY: ${{ secrets.SOLARI_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The step writes the verdict, every run as a glyph, the interval, pass^5,
the checks that missed and the failed runs to the job summary, sets
`passed`, `n`, `pass-at-1`, `pass-at-1-lower`, `pass-pow-5`, `cost-usd`,
`bench-dir` and `exit-code` as outputs, uploads the bench directory as an
artifact whatever happened, and only then raises the gate: exit 0 met, 2
missed, 1 crashed. Without a `snapshot` the action prepares one on every
run, which costs a desktop boot and the task's setup; pass the id from a
first run to skip that and keep every run on one environment. The
scripted provider needs no keys and no Solari, which is how this repo's
own workflow tests the action.

A `task:` starting with `passk:` (`passk:tasks/ticket-queue.yaml`) is one of
the tasks that ship with the action, resolved inside the action's own checkout
and run from there, so its uploads and check scripts are found without a second
checkout in your workflow. Everything else resolves against your workspace.

## Task status

Every task carries a `golden` block, the recipe for a correct outcome with
no agent involved, so `passk validate` can prove its checks fail before and
pass after. Status is one of **validated** (live runs published in
`evidence/`), **ready** (validated verifier, no published runs), or
**illustrative** (a sketch). An unrun task is never presented as evidence.

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
golden:                     # the correct outcome with no agent; run proves the checks against it
  - write: /root/Documents/notes.txt
    content: hello
checks:                     # evaluated INSIDE the desktop after the agent stops
  - type: file_contains
    path: /root/Documents/notes.txt
    text: hello
```

Setup steps: `exec` (argv, no shell), `open` (launch a GUI app by name),
`write` (text to a guest path), `upload` (local file to a guest path), `click`
(x, y), `press` (a key or "+"-joined chord), `type` (literal text), `wait`
(seconds). Everything runs once, before the snapshot, so forks pay none of it.
An `upload` goes over the control channel as one base64 frame: the largest this
project has sent is the 8.6 MB bookmarx tarball, which went through without
complaint. The SDK documents no ceiling, and nothing here has probed for one;
if you are uploading tens of megabytes, expect to find the limit yourself, and
fetch it inside the VM with `exec` instead.

**Setup steps a task shares.** A line that took an afternoon to get right
belongs in one file. `setup_from` pulls a list of steps in ahead of the task's
own, resolved against the task file's directory, with `${name}` placeholders
filled from `with`:

```yaml
setup_from:
  - bookmarx-lite/box.yaml                  # the app, served inside the VM
  - file: bookmarx-lite/chrome.yaml         # the browser, on a page of it
    with: { url: "http://127.0.0.1:8080/box" }
```

The include is a plain list of setup steps (or a document with a `setup:`
list), validated against the same schema as a task's own steps, so a typo in a
shared file fails at load rather than on a booted desktop. Every placeholder
must be supplied; a shell variable inside an included step is therefore written
`$NAME`, never `${NAME}`. Includes are flattened before anything else sees the
task, so the snapshot, the bench's recorded task and the task hash are exactly
what they would have been with the steps pasted in — the eight bookmarx tasks
moved to `tasks/bookmarx-lite/chrome.yaml` without a single hash changing.

**Evidence a run keeps.** A check answers yes or no; the file behind the answer
explains it. `evidence` names guest paths that every run copies out after
grading, into `<run dir>/evidence/`:

```yaml
evidence:
  - /root/app/state.json     # the whole decisions map, not just which check missed
```

They are copied after the checks and before the desktop is killed, appear on
each run in the report, survive `passk export`, and are skipped with a note if
a file is missing or over 2 MB. Declaring one cannot change an outcome, so it
is left out of the task hash: a bench that starts keeping a state file is still
comparable with the one before it.

**Frames a run may not publish.** A task that drives a screen carrying real
content — someone's library, a record with a real name on it — declares
`screenshots: private`. The frames are still captured, so the local report and
the divergence diff work as ever; they simply never leave `runs/`. Export
copies none and references none, and `export-inspect --images` embeds none.
Grade such a task from an `evidence` file instead, the way `bookmarx-triage`
is graded from its decisions map. This too is out of the task hash.

**Identifiers a run may not publish.** An evidence file that grades honestly
often names real things: the decisions map is keyed by post id. `labels`
names a guest file of `{ identifier: label }`:

```yaml
labels: /root/app/labels.json   # { "1844896946642878650": "target 6 (hateful)", … }
```

Every run keeps a copy beside its trace, never exported. `passk export`
then rewrites the bench and every evidence file it copies so each identifier
appears only as its label — in check details, in the agent's own words, in
the hypotheses, and as the keys of a decisions map, which stays valid JSON.
A reader learns which labelled thing got which decision and never which
real thing that was. Once a map is in play the export is all or nothing: an
identifier-shaped token the map misses stops it, naming the identifier and
where it still appears, because a label file that misses one post is the
case this exists to catch. `passk export --labels file.json` applies a map
to a bench recorded before its task declared one; `--no-screenshots` is the
same for frames. Neither edits what the run wrote down. The boxed bookmarx
tasks declare both; `tasks/bookmarx-lite/labels.py` is the map builder, and
the exported report says how many identifiers became labels.

Check types: `file_exists`, `file_contains`, `file_equals`, `exec` (exit code +
stdout), `screenshot_judge` (the model grades the final screen against a rubric).
Prefer several checks that each grade one fact over one script that grades
everything: a run still passes only if all of them pass, but the report then
carries a Checks table, pass count per check across the bench, worst first,
so a pass rate turns into a diagnosis. `tasks/ticket-routing.yaml` is the
example, with nineteen.
Any check may carry a `name` ("Invoice was created"); reports show it in
place of the raw path or command, which stays available for audit. Naming a
check changes neither grading nor the task hash.

## What `run` does

```
passk run tasks/notes.yaml --k 10

  prepare    no snapshot for this task yet? boot the template, run setup, snapshot, kill
  validate   fork once: the checks must fail untouched, agree with themselves twice,
             and pass after the golden steps. Unsound → exit 2, no bench.
  bench      fork ×k from the snapshot, agent loop on each, checks inside the VM, kill
  report     pass@1 with its interval, pass^k, divergence and cause per failure, report.html
```

The report marks a run that stopped by itself at or under a quarter of the
bench's median effort without passing: a run that stopped after two steps
and one that worked to the step cap and got it wrong are both failures, and
they are not the same failure. The mark says what happened; whether the agent
gave up or believed it was done is left to the hypotheses. With classification switched off, the report,
the terminal summary and the job summary all say so where the hypotheses would
have been, so an empty failure section is never read as "nothing to explain".

Every step of that is also a command on its own (`prepare`, `validate`,
`report`, `classify`), for when you want one piece: `--prepare` forces a fresh
snapshot, `--no-validate` skips the verifier check while you iterate on a task,
`--resume` finishes an interrupted bench or extends a finished one with a
larger `--k`. The validation result is recorded on the bench and shown in its
report, so a number always says whether its verifier was proven.

The verifier check is the step that would have caught both verifier bugs
found during this work, and it is why an unsound task cannot produce a
number. It costs one desktop boot and no model calls unless a check is a
screenshot judge.

`passk sweep` kills anything tagged passk that an interrupted bench left
running. Task files carry a `yaml-language-server` schema hint; with the YAML
extension in VS Code you get completion and validation from
`schema/task.schema.json`.

## Tasks that ship

Status is **validated** when live runs are published in [`evidence/`](../evidence/),
**ready** when the verifier is proven and no runs are published.

| Task | Template | Status | What it exercises |
|---|---|---|---|
| `ticket-routing` / `-reload` | default | validated, 20 + 20 runs | A support queue served from inside the VM, no login, no proxy, state in a JSON file the checker reads. Twelve tickets, a Team page with the routing table, an SLA rule on ticket age, and traps: two customers named Acme, a row already correct, three closed rows. Nineteen checks grade one fact each, so the report's Checks table says which rule fails. A prompt pair: baseline vs reload-and-confirm, compared per check. |
| `ticket-queue` | default | ready | The same tool, simpler: five tickets, one closed row that must not be touched. The task to start from. |
| `bookmarx-triage` / `-keep` | default | ready, **needs the export** | bookmarx, run *inside* the desktop as static files plus a stdlib server over a 269-post slice of its demo library (`tasks/bookmarx-lite/`). The review queue before a public demo: seventeen posts, nine the rules say to remove and eight guards that look risky and are clean. Nineteen checks, one fact each, named by category and never by post. A prompt pair: the bare rules vs the rules plus "when unsure, keep", for over-deletion against under-deletion per check. |
| `bookmarx-box-lookup` / `-paraphrase` / `-deep` | default | ready, **needs the export** | The three search memories, on the boxed bookmarx: graded from the click the app records inside the VM. |
| `bookmarx-lookup` / `-paraphrase` / `-scroll` | default | ready | The same memories against the live site through Chrome's DevTools port; read-only, so the live database is safe. |
| `notes` | default | ready | Save a note in Mousepad: the ten-line task in the README, for a first run. |
| `fake` | none | harness test | Runs on the scripted provider; exercises the pipeline with no VM or model. It is what CI runs. |

**The five boxed bookmarx tasks need a file this repository does not carry.**
They upload `tasks/bookmarx-lite/bookmarx-box.tar.gz`, the export built by
`pnpm demo:export` in [bookmarx](https://github.com/tohirr/bookmarx); it stays
out of git because the review queue's removal targets are real saved posts.
Without it those tasks are refused at load, naming the file and pointing at
[`tasks/bookmarx-lite/README.md`](../tasks/bookmarx-lite/README.md), which says
how to build it — nothing boots and nothing is billed. Every other task in the
table runs from a clone.

The ticket queue is a mock on purpose. A mock lets the bench
own the state, plant a trap, and verify exactly. What they keep from the real
thing is the shape: existing records to search, a duplicate to avoid, required
fields, dropdowns, a file upload, a business rule ("pending review"), and a
consequential action that must not happen.

The ticket queue is the shape of task Solari's own site lists under portal
automation: "enter data, submit forms, and complete workflows inside portals
that don't expose the APIs". Because the app lives in the snapshot, fifty runs cost
about a dollar on a budget model.

The shipped tasks are examples of the format, not a suite, and there is no
leaderboard of models. passk asks whether *your* agent is dependable on
*your* workflow; the argument is in [Method](METHOD.md#not-a-model-benchmark).

## Change one thing, measure again

The bench is the instrument; the experiment is the point. Fork the same
snapshot under two conditions, then compare:

```bash
passk run tasks/ticket-routing.yaml --k 20                                   # baseline prompt
passk run tasks/ticket-routing-reload.yaml --k 20 --snapshot snap_…           # one sentence added, same snapshot
passk compare runs/ticket-routing-2*/ runs/ticket-routing-reload-*/
```

`compare` says what was held fixed (snapshot, checks, model), what changed
(prompt, environment), the observed delta in passes, steps, time and cost per
success, and Fisher's exact p-value for the pass/fail split. It refuses to
attribute a difference when more than one thing changed. Note how little
small samples can prove: 4/10 against 9/10 looks decisive and is p = 0.057.
The by-check table holds itself to the same standard — every row carries each
side's 95% interval and its own Fisher p, because a row is a sample of the same
size as the bench, and 5/10 against 2/10 is a thirty-point delta between two
intervals that almost entirely overlap. Read each p on its own row and do not
count them: the rows are not independent, since one wrong action commonly
fails several checks at once, so a handful of rows under 0.05 is one finding
with several names, not several findings.

## Evidence

[`evidence/`](../evidence/) holds every bench cited in the README: `bench.json`
with every action, check, provenance record and task hash; the report page;
the final screenshot of every run; and every screenshot of every failed run
and of the shortest passing run. The comparison folder holds the paired result.
`passk export runs/<dir> evidence/<name>` copies a bench with only the
screenshots that carry proof, plus every evidence file the task declared.

A task whose screens carry real content adds `screenshots: private`, and then
no frame leaves `runs/`: none is copied, the exported report shows none, and
`export-inspect --images` embeds none. The numbers, the checks as run and the
declared evidence files are exported as usual, so the bench is still auditable
— the `bookmarx-triage` pair is graded from `state.json`, the decisions
themselves, rather than from pictures of someone's library. Like `evidence`,
the declaration cannot change an outcome, so it is not in the task hash. `labels: <guest file>` does the same for identifiers inside the evidence — post ids become `target 6 (hateful)` on the way out — and the export refuses if one is missed; `--labels file.json` applies a map at publish time.
(In `bench.json`, spend per run is `usage.costUsd` and spend for the bench is
`metrics.totalCostUsd`; there is no `metrics.costUsd`.) `passk export-inspect runs/<dir> [out dir]`
writes the bench as an [Inspect AI](https://inspect.aisi.org.uk/) eval log:
one task, one sample, each run an epoch, the checks as the scorer, lost runs
unscored, every step a tool call, so `inspect view` opens it beside whatever
else a team evaluates there (`--images` embeds the screenshots as data URLs); `sh scripts/curate-evidence.sh` rebuilds the
whole directory from `runs/`. `npm run assets` redraws the two still images
in `docs/` (failure evidence, how it works) from the same bench files.
`docs/demo.tape` records the no-key demo as a GIF with
[vhs](https://github.com/charmbracelet/vhs): `vhs docs/demo.tape`.

## Reading bench.json

Every page, summary and action output is rendered from one file:
`runs/<task>-<timestamp>/bench.json`. Anyone who needs a number rather than a
page reads that file; `report.html` embeds the same JSON in a
`<script id="bench">` tag, so a report is self-describing too.

```bash
jq '.metrics | {passed, n, passAt1, passAt1Lower, passAt1Upper, medianSteps, totalCostUsd, earlyQuits}' runs/<dir>/bench.json
jq '.runs[] | {runIndex, status, stoppedBy, steps: (.steps | length), evidence}'   runs/<dir>/bench.json
jq '.metrics.checks | sort_by(.passed / .n)'                                        runs/<dir>/bench.json
```

Top level: `status` (`running` until finalised), `taskId`, `taskName`,
`prompt`, `model`, `snapshotId`, `k`, `startedAt`, `finishedAt`, `runs`,
`metrics`, `failures` (one hypothesis per failed run, empty when
`classified` is false), `provenance` (the task as run, its hash, versions,
commit, system-prompt hash), and `validation` (what the verifier check proved
before the bench).

`metrics`, all computed from `runs`, so `passk report` can recompute them
under a newer definition:

| field | meaning |
|---|---|
| `requested`, `n`, `passed` | runs asked for; runs scored (attempted, not lost); runs whose every check passed |
| `errored`, `lost.{solari,provider,verifier}`, `skipped` | runs not scored against the agent, by cause; runs never started for budget |
| `passAt1`, `passAt1Lower`, `passAt1Upper` | `passed / n` and its 95% Wilson interval |
| `endToEnd` | `passed / requested`: what the user actually got, losses included |
| `passPowK[k]`, `passPowKLower[k]`, `passAtK[k]` | all-of-k, its lower bound, and any-of-k, for every k up to n |
| `meanSteps`, `medianSteps`, `p95Steps`, `minSteps`, `maxSteps` | effort, over scored runs; the same five for `…DurationMs` |
| `totalCostUsd`, `costPerSuccessUsd`, `costPerPassingRunUsd` | spend over all runs; scored spend ÷ passes; mean spend of passing runs |
| `checks[]` | per check in task order: `label`, `invariant`, `passed`, `n` |
| `earlyQuits[]`, `earlyQuitSteps` | runs that stopped by themselves at or under the threshold without passing; the threshold (0 when not applicable) |

Each of `runs[]`: `runIndex`, `sessionId`, `status` (`passed` / `failed` /
`errored`), `stoppedBy` (`end_turn`, `max_steps`, `refusal`, `error`,
`safety_check`), `errorKind` (`agent`, `provider`, `solari`, `verifier`),
`steps[]` (every action with its input, timing and screenshot path),
`checks[]` (each check with `passed`, `detail`, and `errored` when the check
itself could not run), `finalScreenshot`, `finalMessage` (recorded, never
graded), `usage.{inputTokens,outputTokens,costUsd}`, `evidence[]`
(`path`, `file`, `bytes`, or `error`), and `error`.

The type definitions in [`src/types.ts`](../src/types.ts) are the reference;
the comments there say why each field exists. In CI the headline values also
arrive as step outputs, so a workflow never has to parse the file.

## Benching your own agent

The bundled loops are one Claude loop and one OpenAI loop, chosen by
`PASSK_PROVIDER`. To bench your own agent, point `PASSK_AGENT` at a module
in your repo (or pass `agent:` to the action):

```bash
PASSK_AGENT=src/my-agent.ts npm run passk run tasks/ticket-queue.yaml -- --k 10
```

The module exports `runAgent`, or a default export, with the signature
published as `passk/agent-types` — a types-only entry, no runtime and no
dependency on the Solari SDK, so your repo type-checks against the contract
instead of restating it:

```ts
import type { AgentRunOptions, AgentRunOutput } from "passk/agent-types";

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunOutput> {
  // opts.desktop  a live Solari Desktop handle: screenshot(), mouse, keyboard, fs, exec
  // opts.prompt   the task's prompt, exactly as a user would type it
  // opts.maxSteps the step budget; opts.outDir where to write step screenshots
  // return { steps, finalMessage, usage: { inputTokens, outputTokens }, stoppedBy }
}
```

`AgentRunOptions`, `AgentRunOutput`, `TraceStep`, `StoppedBy`, `ErrorKind` and
the slice of `Desktop` an agent drives all come from there; passk's own
`src/agent/published-contract.ts` fails the typecheck if that entry ever stops
describing the real loop. If your repo already depends on `@solarisdk/sdk`, its
`Desktop` is assignable to the published one and you can use either.

The module resolves against the working directory and imports from your repo's
`node_modules`, so install your repo before the bench. Any model or none:
the bench's `model` is `PASSK_MODEL` if set, else `custom`, and cost is
estimated only when a price is known for it. Two rules make the bench
honest and are not negotiable: the agent never sees the task's checks (they
are stripped before the call), and the agent's own claim of success is
recorded but never graded. `test/fixtures/custom-agent.ts` is the smallest
example, and the repo's workflow runs it through the action on in-memory
desktops (`PASSK_FAKE=1`).

## What passk can and cannot do today

**Supported.** Anything whose meaningful state lives inside the desktop, because
that is what a Solari snapshot isolates and a fork resets: LibreOffice and
other desktop applications, PDFs and files, local web tools served from the
VM, multi-application workflows across the three templates, custom templates,
benches of 50+ runs, and controlled comparisons of prompts on one snapshot.
Every result in [`evidence/`](../evidence/) is one of these.

**Experimental.** Written but not exercised: the Claude agent loop (no working
key during development). Architecturally supported but not demonstrated:
comparing two models on one snapshot. Likely to work with care: longer
workflows of 60 to 100 steps (raise `max_steps`, expect context growth and
higher cost per run), and local instances of heavier software such as an
Odoo container (longer boot, more memory).

**Unsupported.** Anything where the state the agent changes lives outside the
desktop. A snapshot resets the VM; it does not reset Gmail, Shopify, GitHub,
Salesforce, or a shared test database. Five forks told to "create an invoice
for Acme" against a live SaaS account will create five invoices, and the
checker cannot see any of them. Also out of scope: real payments, messages,
bookings or publishing; regulated or customer data; production enterprise
systems; multi-hour unattended tasks; adversarial task definitions; and
anything where a wrong action is irreversible.

**External state, if you need it.** The extension point is documented, not
built. A task that touches an external system would declare it and supply
lifecycle hooks:

```yaml
isolation: external          # default is "snapshot"
before_each:                 # reset or seed external state; runs on the host, not in the VM
  - exec: ./scripts/reset-test-tenant.sh
after_each:
  - exec: ./scripts/delete-test-records.sh --run ${RUN_ID}
checks:
  - type: http_json          # a verifier that queries the system from outside the agent's desktop
    url: ${LEDGER_TEST_API}/invoices/NOS-1047
    expect: { status: pending_review, total: 1333.0 }
```

The principle that must hold for any of it: verification runs from passk's
host process with credentials the agent never sees, and each run acts on
records it can identify as its own. Until those hooks exist, passk should not
be pointed at a system that other people can see.
