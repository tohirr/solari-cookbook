# Evidence

Every bench here was run against the real Solari API and graded inside the VM. Each folder holds `bench.json` (every run, every action, every check, provenance and a task hash), `report.html`, the final screenshot of every run, and every screenshot of every failed run plus the shortest passing run. Comparison folders hold `compare.json` and `compare.html`. Open the HTML files locally; GitHub shows the JSON.

Numbers are observed counts with a 95% Wilson interval. Runs lost to infrastructure before the agent acted are listed but not scored. Failure causes are hypotheses, not verdicts.

| Bench | Model | Passed | Pass rate (95%) | pass^5 | Median steps | $/success | Infra losses |
|---|---|---|---|---|---|---|---|
| [invoice-entry](invoice-entry/report.html) | `gpt-5.6-luna` | 23/26 | 88% (71%–96%) | 51% | 41 | $0.035 | 4 |
| [notes-nodir](notes-nodir/report.html) | `gpt-5.6-luna` | 2/5 | 40% (12%–77%) | 0% | 30 | $0.052 | 0 |
| [notes](notes/report.html) | `gpt-5.6-luna` | 5/5 | 100% (57%–100%) | 100% | 9 | $0.005 | 0 |
| [q3-total](q3-total/report.html) | `gpt-5.6-luna` | 10/10 | 100% (72%–100%) | 100% | 11.5 | $0.016 | 0 |
| [rename-invoices-clarified](rename-invoices-clarified/report.html) | `gpt-5.6-luna` | 5/5 | 100% (57%–100%) | 100% | 21 | $0.020 | 0 |
| [rename-invoices](rename-invoices/report.html) | `gpt-5.6-luna` | 5/5 | 100% (57%–100%) | 100% | 16 | $0.014 | 0 |
| [ticket-queue-baseline](ticket-queue-baseline/report.html) | `gpt-5.6-luna` | 47/50 | 94% (84%–98%) | 72% | 15 | $0.007 | 0 |
| [ticket-queue-reload](ticket-queue-reload/report.html) | `gpt-5.6-luna` | 49/49 | 100% (93%–100%) | 100% | 18 | $0.008 | 1 |
| [ticket-queue-terra](ticket-queue-terra/report.html) | `gpt-5.6-terra` | 10/10 | 100% (72%–100%) | 100% | 14 | $0.079 | 0 |
| [ticket-queue-verify](ticket-queue-verify/report.html) | `gpt-5.6-luna` | 47/49 | 96% (86%–99%) | 80% | 15 | $0.007 | 1 |
| [ticket-routing](ticket-routing/report.html) | `gpt-5.6-luna` | 5/18 | 28% (12%–51%) | 0% | 56 | $0.126 | 2 |

## Comparisons

- [compare-invoices-prompt](compare-invoices-prompt/compare.html): changed **prompt**; passes 5/5 → 5/5, median steps 16 → 21, Fisher p = 1.00
- [compare-notes-environment](compare-notes-environment/compare.html): changed **snapshot**; passes 2/5 → 5/5, median steps 30 → 9, Fisher p = 0.17
- [compare-ticket-queue-baseline-vs-reload](compare-ticket-queue-baseline-vs-reload/compare.html): changed **prompt**; passes 47/50 → 49/49, median steps 15 → 18, Fisher p = 0.24
- [compare-ticket-queue-baseline-vs-verify](compare-ticket-queue-baseline-vs-verify/compare.html): changed **prompt**; passes 47/50 → 47/49, median steps 15 → 15, Fisher p = 1.00
- [compare-ticket-queue-model](compare-ticket-queue-model/compare.html): changed **model**; passes 47/50 → 10/10, median steps 15 → 14, Fisher p = 1.00

## How to read the three ticket-queue benches

Same snapshot, same model, same checks; only the last sentence of the prompt differs. The baseline's three failures were all one thing: a Save click that did not land, followed by a confident claim of success. Asking the agent to screenshot and confirm changed nothing, because the dropdown shows the new value whether or not it was saved. Asking it to reload forced a read from the server, and no run failed.

Regenerate this folder with `sh scripts/curate-evidence.sh`.
