#!/usr/bin/env bash
# verify.sh — Phase 4 verification loop driver (Cursor / no-sub-agent mode).
#
# 1. Runs the detected test_command gate (databricks bundle validate -t dev).
# 2. Captures the diff (git if available, else a file listing under the harness scope).
# 3. Emits a VERIFIER PACKET = rubric + diff to .harness/state/verify_packet.md.
#
# Then a SEPARATE, fresh verifier pass (new Cursor chat or sub-agent) is seeded with ONLY that
# packet — never a continuation of the builder's conversation — and grades pass/fail per criterion
# WITHOUT editing code. On FAIL, feed the report back to the builder and re-run (bounded attempts).
#
# Usage: .harness/bin/verify.sh [--rubric path] [--base <git-ref>]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HARNESS="$ROOT/.harness"
RUBRIC="$HARNESS/RUBRIC.md"
BASE=""
TARGET="${DATABRICKS_BUNDLE_TARGET:-dev}"
PACKET="$HARNESS/state/verify_packet.md"
AUDIT="$HARNESS/audit.log"

while [ $# -gt 0 ]; do
  case "$1" in
    --rubric) RUBRIC="$2"; shift 2;;
    --base)   BASE="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

log() { printf '%s\t%s\n' "$(date -u +%FT%TZ)" "$1" >> "$AUDIT"; }

echo "== Phase 4 gate: databricks bundle validate -t $TARGET =="
log "verify: gate start (target=$TARGET)"
GATE_OUT="$(cd "$ROOT" && databricks bundle validate -t "$TARGET" 2>&1)" && GATE_RC=0 || GATE_RC=$?
echo "$GATE_OUT"
if [ "$GATE_RC" -eq 0 ]; then echo "GATE: PASS"; log "verify: gate PASS"; else echo "GATE: FAIL (rc=$GATE_RC)"; log "verify: gate FAIL rc=$GATE_RC"; fi

echo "== Capturing diff =="
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  REF="${BASE:-HEAD}"
  DIFF="$(git -C "$ROOT" --no-pager diff "$REF" 2>/dev/null; git -C "$ROOT" --no-pager diff --cached 2>/dev/null)"
  [ -z "$DIFF" ] && DIFF="(no diff vs $REF; check untracked files: $(git -C "$ROOT" ls-files --others --exclude-standard | tr '\n' ' '))"
else
  DIFF="(not a git repo — list recently modified source files manually; run git init to enable diffs)"
fi

{
  echo "# VERIFIER PACKET (generated $(date -u +%FT%TZ))"
  echo
  echo "Grade the diff below against the rubric. Pass/fail per criterion with file:line evidence."
  echo "You are an INDEPENDENT verifier: do NOT edit code. Seeded only with this packet."
  echo
  echo "## Gate result"
  echo '```'
  echo "$GATE_OUT"
  echo "exit_code=$GATE_RC"
  echo '```'
  echo
  echo "## Rubric"
  echo '```'
  cat "$RUBRIC"
  echo '```'
  echo
  echo "## Diff"
  echo '```diff'
  echo "$DIFF"
  echo '```'
} > "$PACKET"

log "verify: packet written -> $PACKET"
echo "== Verifier packet written to: $PACKET =="
echo "Next: open a FRESH chat/sub-agent, paste ONLY $PACKET, and have it grade pass/fail."
echo "On FAIL, return the report to the builder, self-correct, and re-run (max attempts: 3)."
[ "$GATE_RC" -eq 0 ] || exit "$GATE_RC"
