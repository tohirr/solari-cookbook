import json
t = {x["id"]: x for x in json.load(open("/root/app/tickets.json"))}
want = {
  101: {"assignee": "Dana", "priority": "urgent", "status": "open"},
  102: {"assignee": "Dana", "priority": "normal", "status": "open"},
  103: {"assignee": "Sam", "priority": "normal", "status": "closed"},   # closed: must be untouched
  104: {"assignee": "unassigned", "priority": "high", "status": "open"},
  105: {"assignee": "Dana", "priority": "low", "status": "open"},
  106: {"assignee": "unassigned", "priority": "low", "status": "open"},
}
bad = []
for tid, w in want.items():
    for k, v in w.items():
        if t.get(tid, {}).get(k) != v: bad.append(f"{tid}.{k}={t.get(tid, {}).get(k)!r} want {v!r}")
print("ALL_OK" if not bad else "MISMATCH: " + "; ".join(bad))
