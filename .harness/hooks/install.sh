#!/usr/bin/env bash
# Installs the harness pre-commit hook into .git/hooks. Idempotent.
# Requires a git repo (run `git init` first — this repo is not yet initialized).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repo yet. Run 'git init' first, then re-run this installer." >&2
  exit 1
fi

HOOKS_DIR="$(git -C "$ROOT" rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR"
cp "$ROOT/.harness/hooks/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "Installed pre-commit hook -> $HOOKS_DIR/pre-commit"
