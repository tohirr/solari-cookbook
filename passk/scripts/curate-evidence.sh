#!/bin/sh
# Rebuild passk/evidence from runs/: export each named bench with only the
# proof-bearing screenshots, shrink them to JPEG, then regenerate the
# comparison page against the exported copies so every link resolves inside
# the evidence folder. Run from passk/.
set -e
P="npx tsx src/cli.ts"
mkdir -p evidence && rm -rf evidence/compare-*

export_bench() {
  name=$1; src=$(ls -d runs/$2/ 2>/dev/null | tail -1)
  [ -n "$src" ] || { echo "missing: $2"; exit 1; }
  $P export "$src" "evidence/$name"
}
export_bench ticket-routing        "ticket-routing-2026-09-10T08-33*"
export_bench ticket-routing-reload "ticket-routing-reload-2026-09-10T09-16*"

# PNG → JPEG (max 800px wide) and rewrite references. sips ships with macOS.
for png in $(find evidence -name '*.png'); do
  jpg="${png%.png}.jpg"
  sips -s format jpeg -s formatOptions 45 -Z 800 "$png" --out "$jpg" >/dev/null 2>&1 && rm "$png"
done
for f in $(find evidence \( -name 'bench.json' -o -name 'report.html' \)); do
  sed -i '' 's/\.png"/.jpg"/g' "$f"
done

$P compare evidence/ticket-routing evidence/ticket-routing-reload --out evidence/compare-ticket-routing-prompt >/dev/null
for f in evidence/compare-*/compare.html; do sed -i '' 's/\.png"/.jpg"/g' "$f"; done

python3 scripts/evidence-index.py > evidence/README.md
npx tsx scripts/showcase.ts
du -sh evidence; echo "$(find evidence -name '*.jpg' | wc -l) screenshots"
