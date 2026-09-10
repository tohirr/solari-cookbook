"""One fact per call, so the report can say which rule fails, not just that a run did.

  check.py field <id> <value>       ticket <id>'s <field> equals <value>            → OK / MISMATCH
  check.py untouched <id> ...       each listed ticket is exactly as shipped        → OK / MISMATCH
  check.py count <n>                exactly n tickets exist                         → OK / MISMATCH
"""
import json, sys

SHIPPED = {
  103: {"status": "closed", "priority": "normal", "assignee": "Sam"},
  106: {"status": "open", "priority": "normal", "assignee": "Sam"},
  108: {"status": "closed", "priority": "low", "assignee": "Sam"},
  111: {"status": "closed", "priority": "high", "assignee": "Dana"},
}
t = {x["id"]: x for x in json.load(open(__import__("os").environ.get("PASSK_APP", "/root/app") + "/tickets.json"))}
cmd, args = sys.argv[1], sys.argv[2:]
bad = []
if cmd == "field":
    tid, field, value = int(args[0]), args[1], args[2]
    got = t.get(tid, {}).get(field)
    if got != value: bad.append(f"{tid}.{field}={got!r} want {value!r}")
elif cmd == "untouched":
    for tid in map(int, args):
        for k, v in SHIPPED[tid].items():
            got = t.get(tid, {}).get(k)
            if got != v: bad.append(f"{tid}.{k}={got!r} want {v!r}")
elif cmd == "count":
    if len(t) != int(args[0]): bad.append(f"{len(t)} tickets, want {args[0]}")
print("OK" if not bad else "MISMATCH: " + "; ".join(bad))
