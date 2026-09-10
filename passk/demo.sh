#!/bin/sh
# A forty-second demo with no API spend: run a bench on the scripted provider so
# the terminal shows the real flow (snapshot, validate the verifier, fork, run, check, report, gate), then open
# the real evidence. Record this, or just watch it.
#   sh demo.sh
set -e
export PASSK_PROVIDER=scripted PASSK_CLASSIFY=0 PASSK_RUNS_DIR=/tmp/passk-demo PASSK_STATE_DIR=/tmp/passk-demo-state
export PASSK_SCRIPT="pass*6,fail,pass,claim_only,pass"
rm -rf /tmp/passk-demo /tmp/passk-demo-state
echo "▶ passk run tasks/fake.yaml --k 10 --require 0.9      (scripted provider: no VM, no model, same pipeline)"
echo
npx tsx src/cli.ts run tasks/fake.yaml --k 10 --require 0.9 --concurrency 4 || echo "(exit $? : the gate refused a 80% agent, as it should)"
echo
echo "▶ now the real evidence: the three-way ticket-queue comparison, and a failed invoice run's screenshots"
open evidence/compare-ticket-queue-baseline-vs-reload/compare.html 2>/dev/null || true
open evidence/invoice-entry/report.html 2>/dev/null || true
