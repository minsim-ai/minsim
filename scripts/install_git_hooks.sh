#!/usr/bin/env bash
# Point this clone/worktree at repo-managed hooks under .githooks/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
echo "Installed git hooksPath=.githooks (pre-commit hygiene gate active)"
