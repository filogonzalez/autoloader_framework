#!/usr/bin/env bash
# PASS (exit 0) when the framework notebook contains NO hardcoded per-source operation_id
# branching (e.g. `operation_id == "op_..."` or references to seeded op_ ids in logic).
# The framework must be config-driven, not source-specific.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FILE="$ROOT/src/notebooks/10_ingestion_framework.py"

if [ ! -f "$FILE" ]; then echo "missing: $FILE"; exit 1; fi

# Any literal seeded operation id appearing in the framework body is a smell.
if grep -nE 'op_(pos|supplier|crm|clickstream|loyalty)' "$FILE"; then
  echo "FAIL: hardcoded source-specific operation id found in framework."
  exit 1
fi
# Any direct equality branch on operation_id against a literal is a smell.
if grep -nE "operation_id[^=]*==[^=]*['\"]op_" "$FILE"; then
  echo "FAIL: per-source operation_id branch found in framework."
  exit 1
fi
echo "PASS: framework is source-agnostic."
