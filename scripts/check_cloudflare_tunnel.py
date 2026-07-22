"""Check local Cloudflare Tunnel prerequisites without reading secrets."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

CLOUDFLARED_DIR = Path.home() / ".cloudflared"


def main() -> int:
    cloudflared_path = shutil.which("cloudflared")
    config_path = CLOUDFLARED_DIR / "config.yml"
    credential_files = sorted(CLOUDFLARED_DIR.glob("*.json")) if CLOUDFLARED_DIR.exists() else []

    result = {
        "ok": bool(cloudflared_path and config_path.exists() and credential_files),
        "cloudflared": {
            "ok": bool(cloudflared_path),
            "path": cloudflared_path,
        },
        "config": {
            "ok": config_path.exists(),
            "path": str(config_path),
        },
        "credentials": {
            "ok": bool(credential_files),
            "count": len(credential_files),
            "paths": [str(path) for path in credential_files],
        },
        "expected_hostname": "arabesque.cc",
        "expected_origin": "http://localhost:8000",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
