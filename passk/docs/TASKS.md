# Writing and running tasks

The operator's manual: the task format, verifying a verifier, benching your own agent, and what is in and out of scope. Companion to the [README](../README.md) and [Method](METHOD.md).

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

<p align="center"><a href="evidence/invoice-entry/report.html"><img src="docs/report-invoice-entry.jpg" alt="Invoice entry report: 23/26, every run a dot, effort per run, filmstrips" width="100%"></a></p>

## First run

```bash
npm run passk doctor
npm run passk validate tasks/notes.yaml
```

`validate` forks the task's snapshot and proves the verifier is sound: the
checks fail on the untouched state, agree with themselves when run twice,
and pass after the task's `golden` steps. One desktop boot, no model calls.
Run it on every new task before spending a cent on an agent; it is the
command that would have caught both verifier bugs found during this work.
`doctor`

checks the keys, reaches Solari, boots and kills one desktop, sends the
model a one-token request, and prints what a run would use: provider, model,
concurrency, and the safety setting. `npm run passk sweep` kills anything
tagged passk that an interrupted bench left running. Task files carry a
`yaml-language-server` schema hint; with the YAML extension in VS Code you
get completion and validation from `schema/task.schema.json`.

## Benching your own agent

The bundled loops are one Claude loop and one OpenAI loop, chosen by
`PASSK_PROVIDER`. A team with its own agent writes a third file in
`src/agent/` implementing the same interface (`AgentRunOptions →
AgentRunOutput` in `src/agent/index.ts`): it receives a live desktop handle,
the prompt, a step budget and an output directory, and returns the trace of
actions it took, its token usage, and how it stopped. Two rules make the
bench honest and are not negotiable: the agent never sees the task's checks,
and the agent's own claim of success is recorded but never graded. The
scripted agent in `src/agent/scripted.ts` is the smallest example.

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
