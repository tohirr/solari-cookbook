"""Write evidence/README.md from the exported bench.json files."""
import json, glob, os
pct = lambda x: f"{round(x*100)}%"
rows = []
for d in sorted(glob.glob("evidence/*/bench.json")):
    b = json.load(open(d)); m = b["metrics"]; name = os.path.basename(os.path.dirname(d))
    rows.append((name, b, m))
print("# Evidence\n")
print("Every bench here was run against the real Solari API and graded inside the VM. Each folder holds `bench.json` (every run, every action, every check, provenance and a task hash), `report.html`, the final screenshot of every run, and every screenshot of every failed run plus the shortest passing run. Comparison folders hold `compare.json` and `compare.html`. Open the HTML files locally; GitHub shows the JSON.\n")
print("Numbers are observed counts with a 95% Wilson interval. Runs lost to infrastructure before the agent acted are listed but not scored. Failure causes are hypotheses, not verdicts.\n")
print("| Bench | Model | Passed | Pass rate (95%) | pass^5 | Median steps | $/success | Infra losses |")
print("|---|---|---|---|---|---|---|---|")
for name, b, m in rows:
    k5 = m['passPowK'].get('5', m['passPowK'].get(str(m['n']), 0))
    cps = '—' if m['costPerSuccessUsd'] is None else f"${m['costPerSuccessUsd']:.3f}"
    print(f"| [{name}]({name}/report.html) | `{b['model']}` | {m['passed']}/{m['n']} | {pct(m['passAt1'])} ({pct(m['passAt1Lower'])}–{pct(m['passAt1Upper'])}) | {pct(k5)} | {m['medianSteps']} | {cps} | {m['errored']} |")
print("\n## Comparisons\n")
for d in sorted(glob.glob("evidence/compare-*/compare.json")):
    c = json.load(open(d)); name = os.path.basename(os.path.dirname(d)); a, b = c["a"]["metrics"], c["b"]["metrics"]
    print(f"- [{name}]({name}/compare.html): changed **{', '.join(c['changed'])}**; passes {a['passed']}/{a['n']} → {b['passed']}/{b['n']}, median steps {a['medianSteps']} → {b['medianSteps']}, Fisher p = {c['fisherP']:.2f}")
print("\n## How to read the three ticket-queue benches\n")
print("Same snapshot, same model, same checks; only the last sentence of the prompt differs. The baseline's three failures were all one thing: a Save click that did not land, followed by a confident claim of success. Asking the agent to screenshot and confirm changed nothing, because the dropdown shows the new value whether or not it was saved. Asking it to reload forced a read from the server, and no run failed.\n")
print("Regenerate this folder with `sh scripts/curate-evidence.sh`.")
