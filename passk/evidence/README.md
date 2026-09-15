# Evidence

Every bench here was run against the real Solari API and graded inside the VM. Each folder holds `bench.json` (every run, every action, every check, provenance and a task hash), `report.html`, the final screenshot of every run, and every screenshot of every failed run plus the shortest passing run. Comparison folders hold `compare.json` and `compare.html`. Open the HTML files locally; GitHub shows the JSON.

Numbers are observed counts with a 95% Wilson interval. Runs lost to infrastructure before the agent acted are listed but not scored. Failure causes are hypotheses, not verdicts.

| Bench | Model | Passed | Pass rate (95%) | pass^5 | Median steps | $/success | Infra losses |
|---|---|---|---|---|---|---|---|
| [ticket-routing-reload](ticket-routing-reload/report.html) | `gpt-5.6-luna` | 14/20 | 70% (48%–85%) | 13% | 80 | $0.061 | 0 |
| [ticket-routing](ticket-routing/report.html) | `gpt-5.6-luna` | 5/18 | 28% (12%–51%) | 0% | 56 | $0.126 | 2 |

## Comparisons

- [compare-ticket-routing-prompt](compare-ticket-routing-prompt/compare.html): changed **prompt**; passes 5/18 → 14/20, median steps 56 → 80, Fisher p = 0.02
Regenerate this folder with `sh scripts/curate-evidence.sh`.
