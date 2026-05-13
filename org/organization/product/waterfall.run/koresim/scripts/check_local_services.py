"""Print Gate 1F local readiness checks."""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def main() -> int:
    from src.runtime.health import collect_runtime_health

    health = collect_runtime_health()
    print(json.dumps(health, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if health["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
