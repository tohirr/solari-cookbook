"""Verifies the invoice-entry task against LedgerDesk's state, never its screen."""
import hashlib, json, os
d = json.load(open("/root/ledgerdesk/ledger.json"))
inv = d["invoices"]; ev = d["events"]
bad = []
new = [i for i in inv if i.get("created_by") == "agent"]
if len(new) != 1: bad.append(f"expected exactly 1 new invoice, found {len(new)}")
seeds = [i for i in inv if i.get("created_by") == "seed"]
if len(seeds) != 4 or any(i["status"] != s for i, s in zip(sorted(seeds, key=lambda x: x["id"]), ["paid", "approved", "pending_review", "paid"])):
    bad.append("seed invoices were modified")
if any(e["type"] in ("approve", "pay") for e in ev): bad.append("an approve/pay action was taken: " + str([e for e in ev if e["type"] != "created"]))
if len([i for i in inv if i["invoice_number"] == "NOS-1032"]) != 1: bad.append("NOS-1032 was duplicated")
if new:
    n = new[0]
    want = {"vendor_id": "V-104", "invoice_number": "NOS-1047", "invoice_date": "2026-08-28", "subtotal": 1240.0, "tax": 93.0, "total": 1333.0, "currency": "USD", "terms": "Net 30", "status": "pending_review"}
    for k, v in want.items():
        got = n.get(k)
        if isinstance(v, float): ok = isinstance(got, (int, float)) and abs(got - v) < 0.005
        else: ok = str(got).strip() == v
        if not ok: bad.append(f"{k}={got!r} want {v!r}")
    src = "/home/desktop/Documents/Incoming/northstar-NOS-1047.pdf"
    want_sha = hashlib.sha256(open(src, "rb").read()).hexdigest() if os.path.exists(src) else None
    att = n.get("attachment")
    if not att: bad.append("no attachment")
    elif att.get("sha256") != want_sha: bad.append(f"wrong attachment: {att.get('filename')}")
print("ALL_OK" if not bad else "MISMATCH: " + "; ".join(bad))
