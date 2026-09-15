#!/usr/bin/env python3
"""The correct outcome of the review task, with no agent: every target
removed and every guard kept, through the same API the page uses. passk runs
this on a fork to prove the checks can pass before any agent is paid for."""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "box", "expected.json")) as f:
    expected = json.load(f)


def decide(pid, decision):
    req = urllib.request.Request("http://127.0.0.1:8080/api/triage/" + pid, method="POST",
                                 data=json.dumps({"decision": decision}).encode(),
                                 headers={"content-type": "application/json"})
    urllib.request.urlopen(req).read()


for t in expected["targets"]:
    decide(t["id"], "remove")
for g in expected["guards"]:
    decide(g["id"], "keep")
print("golden: removed %d, kept %d" % (len(expected["targets"]), len(expected["guards"])))
