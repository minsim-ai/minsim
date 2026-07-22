"""Fail if sensitive ops/verification artifacts are tracked or staged for commit.

Keeps the public minsim tree free of:
- verification dumps, Playwright results, agent sessions
- machine-specific deploy configs and internal runbooks
- absolute local path leaks in staged text files
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Prefixes / exact paths that must never be in the public git tree.
BLOCKED_PREFIXES = (
    "docs/verification/",
    "docs/execution/",
    "docs/runbooks/",
    "docs/phases/",
    "docs/reports/",
    "docs/superpowers/",
    "docs/diff-explanations/",
    "docs/research/",
    "docs/templates/",
    "deploy/",
    "test-results/",
    "frontend/test-results/",
    "frontend/playwright-report/",
    "frontend/.vite/",
    ".gjc/",
    ".claude/",
    ".env",
)

BLOCKED_EXACT = {
    "CLAUDE.md",
    "docs/documentation-debt-audit.md",
    ".coverage",
}

BLOCKED_BASENAMES = {
    ".env",
    ".env.local",
}

# Built in pieces so this file does not contain a literal local path string
# that would trip the staged-content scanner.
_RUNTIME_MARK = "koresim" + "-" + "runtime" + "/"
LOCAL_PATH_RE = re.compile(
    "(?:"
    + "/".join(["", "Users", r"[A-Za-z0-9._-]+"])
    + "|"
    + "/".join(["", "home", r"[A-Za-z0-9._-]+"])
    + "|"
    + re.escape(_RUNTIME_MARK)
    + ")"
)

# Text files we scan for absolute local path leaks when staged.
SCAN_SUFFIXES = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".md",
    ".yml",
    ".yaml",
    ".json",
    ".toml",
    ".plist",
    ".example",
    ".txt",
    ".sh",
}


def _run_git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=PROJECT_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def _git_paths(*args: str) -> list[str]:
    return [line.strip() for line in _run_git(*args).splitlines() if line.strip()]


def _is_blocked(path: str) -> bool:
    if path in BLOCKED_EXACT:
        return True
    name = Path(path).name
    if name in BLOCKED_BASENAMES or name.startswith(".env."):
        # Allow the public placeholder only.
        if path == ".env.example":
            return False
        return True
    return any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in BLOCKED_PREFIXES)


def _scan_staged_for_local_paths(staged: list[str]) -> list[str]:
    leaks: list[str] = []
    for path in staged:
        if path.endswith(tuple(SCAN_SUFFIXES)) is False and Path(path).suffix not in SCAN_SUFFIXES:
            # Also scan extensionless example env / plists already covered.
            if not path.endswith(".example"):
                continue
        try:
            blob = _run_git("show", f":{path}")
        except subprocess.CalledProcessError:
            continue
        for line_no, line in enumerate(blob.splitlines(), start=1):
            if LOCAL_PATH_RE.search(line):
                leaks.append(f"{path}:{line_no}:{line.strip()[:160]}")
    return leaks


def main() -> int:
    try:
        tracked = _git_paths("ls-files")
        staged = _git_paths("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    except subprocess.CalledProcessError as exc:
        print(exc.stderr or "git command failed", file=sys.stderr)
        return 2

    blocked_tracked = sorted({path for path in tracked if _is_blocked(path)})
    blocked_staged = sorted({path for path in staged if _is_blocked(path)})
    path_leaks = _scan_staged_for_local_paths(staged)

    if not blocked_tracked and not blocked_staged and not path_leaks:
        print("public tree hygiene: ok")
        return 0

    print("public tree hygiene: FAILED", file=sys.stderr)
    if blocked_tracked:
        print("\nTracked files that must not be public:", file=sys.stderr)
        for path in blocked_tracked:
            print(f"  - {path}", file=sys.stderr)
    if blocked_staged:
        print("\nStaged files that must not be committed:", file=sys.stderr)
        for path in blocked_staged:
            print(f"  - {path}", file=sys.stderr)
    if path_leaks:
        print("\nAbsolute local path leaks in staged files:", file=sys.stderr)
        for item in path_leaks:
            print(f"  - {item}", file=sys.stderr)
    print(
        "\nRemove these paths, unstage them, or update .gitignore. "
        "See scripts/check_public_tree_hygiene.py.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
