#!/usr/bin/env python3
"""The labels a published bench uses instead of post ids.

    python3 labels.py <box dir>          print the map as JSON
    from labels import build             build(box_dir) -> dict

Every post in the seed gets a stable label — "library post 212", its position
in the seed — and the review queue's posts get the names the checks already
use: "target 6 (hateful)", "guard 5". passk's export replaces every id with
its label, so the evidence says which labelled thing got which decision and
never which real post that was. The server writes this beside itself at
startup; the same function runs locally to redact a bench recorded before
the file existed.
"""
import json, os, sys


def build(box_dir):
    with open(os.path.join(box_dir, "seed.json")) as f:
        seed = json.load(f)
    with open(os.path.join(box_dir, "expected.json")) as f:
        expected = json.load(f)
    labels = {}
    for i, post in enumerate(seed.get("posts", [])):
        labels[str(post["id"])] = f"library post {i + 1}"
    for i, t in enumerate(expected.get("targets", [])):
        labels[str(t["id"])] = f"target {i + 1} ({t.get('category', '?')})"
    for i, g in enumerate(expected.get("guards", [])):
        labels[str(g["id"])] = f"guard {i + 1}"
    for pid in expected.get("queue", []):
        labels.setdefault(str(pid), "queued post")
    return labels


if __name__ == "__main__":
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "box")), indent=1))
