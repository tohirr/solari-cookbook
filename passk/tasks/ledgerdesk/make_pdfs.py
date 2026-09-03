#!/usr/bin/env python3
"""Write three clean, large-type invoice PDFs with no dependencies.

A hand-built PDF: one page, Helvetica, text only. Legible at 1280x720 so the
bench measures data entry, not eyesight.
"""
import os, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "incoming")

def pdf(lines, path):
    # lines: list of (x, y, size, text)
    content = "BT\n" + "\n".join(f"/F1 {size} Tf 1 0 0 1 {x} {y} Tm ({t.replace(chr(92), chr(92)*2).replace('(', chr(92)+'(').replace(')', chr(92)+')')}) Tj" for x, y, size, t in lines) + "\nET"
    stream = content.encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode()
    for off in offsets: out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    with open(path, "wb") as f: f.write(out)

def invoice(vendor, addr, number, date, due, terms, items, currency, tax_rate, note=""):
    subtotal = sum(q * p for _, q, p in items)
    tax = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax, 2)
    L = [(60, 730, 26, vendor), (60, 708, 11, addr), (400, 730, 22, "INVOICE"),
         (400, 700, 12, f"Invoice number: {number}"), (400, 682, 12, f"Invoice date: {date}"),
         (400, 664, 12, f"Due date: {due}"), (400, 646, 12, f"Terms: {terms}"),
         (60, 640, 12, "Bill to: Feldy Systems Ltd, 14 Adeola Odeku St, Lagos"),
         (60, 600, 12, "Description"), (380, 600, 12, "Qty"), (440, 600, 12, "Unit price"), (520, 600, 12, "Amount")]
    y = 578
    for desc, q, p in items:
        L += [(60, y, 12, desc), (380, y, 12, str(q)), (440, y, 12, f"{p:,.2f}"), (520, y, 12, f"{q*p:,.2f}")]; y -= 20
    y -= 16
    L += [(400, y, 13, f"Subtotal: {subtotal:,.2f} {currency}"), (400, y-22, 13, f"Tax ({tax_rate*100:.1f}%): {tax:,.2f} {currency}"),
          (400, y-50, 18, f"TOTAL DUE: {total:,.2f} {currency}")]
    if note: L.append((60, y-50, 11, note))
    return L, {"number": number, "date": date, "subtotal": subtotal, "tax": tax, "total": total, "currency": currency, "terms": terms}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    specs = {}
    L, m = invoice("Northstar Office Supplies", "22 Harbour Road, Apapa, Lagos  ·  VAT 0448-2211", "NOS-1047", "2026-08-28", "2026-09-27", "Net 30",
                   [("A4 copier paper, 80gsm (box of 5 reams)", 20, 38.00), ("Toner cartridge HP 26A", 4, 120.00)], "USD", 0.075)
    pdf(L, os.path.join(OUT, "northstar-NOS-1047.pdf")); specs["NOS-1047"] = m
    L, m = invoice("Northstar Office Supplies", "22 Harbour Road, Apapa, Lagos  ·  VAT 0448-2211", "NOS-1032", "2026-07-30", "2026-08-29", "Net 30",
                   [("Ergonomic office chair", 2, 210.00), ("Desk lamp, LED", 6, 24.50)], "USD", 0.075, note="Status: already entered in LedgerDesk on 2026-08-02")
    pdf(L, os.path.join(OUT, "northstar-NOS-1032.pdf")); specs["NOS-1032"] = m
    L, m = invoice("Globex Logistics", "Unit 9, Ikeja Industrial Estate, Lagos", "GX-2210", "2026-08-30", "2026-09-14", "Net 15",
                   [("Courier service, August", 1, 480.00)], "USD", 0.075)
    pdf(L, os.path.join(OUT, "globex-GX-2210.pdf")); specs["GX-2210"] = m
    import json; print(json.dumps(specs, indent=1))
