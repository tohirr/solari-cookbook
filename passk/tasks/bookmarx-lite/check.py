#!/usr/bin/env python3
"""One fact about the box's state, judged from its files.

    python3 check.py target 3        the third removal target is removed
    python3 check.py guard 2         the second guard is still present
    python3 check.py collateral      nothing outside the targets is removed
    python3 check.py reviewed        every post in the queue has a decision
    python3 check.py clicked <id>    a result click on that post was recorded

Reads state.json (what the server wrote) and expected.json (the answer key
the export wrote, which the server never serves). Prints OK or NO with the
detail; passk's exec checks look for the OK. Never looks at the screen.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "state.json")
EXPECTED = os.path.join(HERE, "box", "expected.json")


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)


state = load(STATE, {"decisions": {}, "clicks": []})
expected = load(EXPECTED, {"targets": [], "guards": [], "queue": []})
removed = {pid for pid, d in state["decisions"].items() if d == "remove"}
targets = [t["id"] for t in expected["targets"]]
guards = [g["id"] for g in expected["guards"]]

what = sys.argv[1] if len(sys.argv) > 1 else ""
arg = sys.argv[2] if len(sys.argv) > 2 else ""

if what == "target":
    pid = targets[int(arg) - 1]
    print("PASS" if pid in removed else "NO: target %s (%s) is still present" % (arg, expected["targets"][int(arg) - 1]["category"]))
elif what == "guard":
    pid = guards[int(arg) - 1]
    print("PASS" if pid not in removed else "NO: guard %s was removed (%s)" % (arg, expected["guards"][int(arg) - 1].get("note", "")))
elif what == "collateral":
    extra = sorted(removed - set(targets))
    print("PASS" if not extra else "NO: removed beyond the targets: %s" % ", ".join(extra))
elif what == "reviewed":
    undecided = [pid for pid in expected["queue"] if state["decisions"].get(pid) not in ("remove", "keep")]
    print("PASS" if not undecided else "NO: %d of %d still undecided" % (len(undecided), len(expected["queue"])))
elif what == "clicked":
    hit = any(c.get("bookmarkId") == arg for c in state["clicks"])
    print("PASS" if hit else "NO: no click recorded on %s; clicks: %s" % (arg, [c.get("bookmarkId") for c in state["clicks"]]))
else:
    print("usage: check.py target N | guard N | collateral | reviewed | clicked <id>")
    sys.exit(2)
