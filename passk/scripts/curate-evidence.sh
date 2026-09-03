#!/bin/sh
# Rebuild passk/evidence from runs/: export each named bench with only the
# proof-bearing screenshots, shrink them to JPEG, then regenerate the
# comparison pages against the exported copies so every link resolves inside
# the evidence folder. Run from passk/.
set -e
P="npx tsx src/cli.ts"
rm -rf evidence && mkdir -p evidence

export_bench() {
  name=$1; src=$(ls -d runs/$2/ 2>/dev/null | tail -1)
  [ -n "$src" ] || { echo "missing: $2"; exit 1; }
  $P export "$src" "evidence/$name"
}
export_bench ticket-queue-baseline     "ticket-queue-2026-*"
export_bench ticket-queue-verify       "ticket-queue-verify-*"
export_bench ticket-queue-reload       "ticket-queue-reload-*"
export_bench invoice-entry             "invoice-entry-2026-09-03T01-4*"
export_bench q3-total                  "q3-total-2026-09-02T22-*"
export_bench notes                     "notes-2026-09-02T23-*"
export_bench notes-nodir               "notes-nodir-2026-09-02T23-20*"
export_bench rename-invoices           "rename-invoices-2026-09-02T22-*"
export_bench rename-invoices-clarified "rename-invoices-clarified-*"

# PNG → JPEG (max 1024px wide, q60) and rewrite references. sips ships with macOS.
for png in $(find evidence -name '*.png'); do
  jpg="${png%.png}.jpg"
  sips -s format jpeg -s formatOptions 45 -Z 800 "$png" --out "$jpg" >/dev/null 2>&1 && rm "$png"
done
for f in $(find evidence \( -name 'bench.json' -o -name 'report.html' \)); do
  sed -i '' 's/\.png"/.jpg"/g' "$f"
done

$P compare evidence/ticket-queue-baseline evidence/ticket-queue-reload  --out evidence/compare-ticket-queue-baseline-vs-reload >/dev/null
$P compare evidence/ticket-queue-baseline evidence/ticket-queue-verify  --out evidence/compare-ticket-queue-baseline-vs-verify >/dev/null
$P compare evidence/notes-nodir evidence/notes                            --out evidence/compare-notes-environment >/dev/null
$P compare evidence/rename-invoices evidence/rename-invoices-clarified   --out evidence/compare-invoices-prompt >/dev/null
for f in evidence/compare-*/compare.html; do sed -i '' 's/\.png"/.jpg"/g' "$f"; done

python3 scripts/evidence-index.py > evidence/README.md
du -sh evidence; echo "$(find evidence -name '*.jpg' | wc -l) screenshots"
