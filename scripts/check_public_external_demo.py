"""Validate that the external KoreaSim demo routes are public origin responses."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urljoin


ACCESS_MARKERS = (
    "cloudflare access",
    "cloudflareaccess.com",
    "/cdn-cgi/access",
    "cf-access",
)
DEFAULT_PUBLIC_PATHS = (
    "/",
    "/validation",
    "/api/auth/session",
    "/api/health",
    "/api/config",
)


@dataclass(frozen=True)
class HttpProbe:
    url: str
    status: int | None
    headers: dict[str, str]
    body_sample: str
    error: str | None = None


def parse_headers(raw_headers: str) -> tuple[int | None, dict[str, str]]:
    blocks = [block for block in raw_headers.replace("\r\n", "\n").split("\n\n") if block.strip()]
    if not blocks:
        return None, {}
    header_lines = blocks[-1].splitlines()
    status = None
    if header_lines:
        parts = header_lines[0].split()
        if len(parts) >= 2 and parts[1].isdigit():
            status = int(parts[1])
    headers: dict[str, str] = {}
    for line in header_lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
    return status, headers


def probe_url(url: str, timeout_seconds: int) -> HttpProbe:
    with tempfile.NamedTemporaryFile() as header_file, tempfile.NamedTemporaryFile() as body_file:
        command = [
            "curl",
            "--silent",
            "--show-error",
            "--location",
            "--max-time",
            str(timeout_seconds),
            "--request",
            "GET",
            "--dump-header",
            header_file.name,
            "--output",
            body_file.name,
            "--user-agent",
            "koresim-public-demo-check/1.0",
            url,
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        if completed.returncode != 0:
            return HttpProbe(url=url, status=None, headers={}, body_sample="", error=completed.stderr.strip())
        header_file.seek(0)
        body_file.seek(0)
        status, headers = parse_headers(header_file.read().decode("utf-8", errors="replace"))
        body = body_file.read().decode("utf-8", errors="replace")
        return HttpProbe(url=url, status=status, headers=headers, body_sample=body[:500])


def looks_like_access(probe: HttpProbe) -> bool:
    haystack = "\n".join(
        [
            str(probe.status or ""),
            *(f"{key}: {value}" for key, value in probe.headers.items()),
            probe.body_sample,
        ]
    ).lower()
    return any(marker in haystack for marker in ACCESS_MARKERS)


def classify_public(probe: HttpProbe) -> dict[str, object]:
    access_detected = probe.error is None and looks_like_access(probe)
    ok = probe.error is None and probe.status is not None and 200 <= probe.status < 400 and not access_detected
    return {
        "ok": ok,
        "expected": "public_origin_response",
        "status": probe.status,
        "access_detected": access_detected,
        "content_type": probe.headers.get("content-type"),
        "error": probe.error,
    }


def build_url(base_url: str, path: str) -> str:
    normalized = base_url.rstrip("/") + "/"
    return urljoin(normalized, path.lstrip("/"))


def run_checks(base_url: str, public_paths: Iterable[str], timeout_seconds: int) -> dict[str, object]:
    results = []
    for path in public_paths:
        probe = probe_url(build_url(base_url, path), timeout_seconds)
        results.append({"path": path, "url": probe.url, **classify_public(probe)})
    return {
        "ok": all(result["ok"] for result in results),
        "base_url": base_url,
        "public": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://arabesque.cc")
    parser.add_argument("--timeout-seconds", type=int, default=15)
    parser.add_argument("--public-path", action="append", default=list(DEFAULT_PUBLIC_PATHS))
    args = parser.parse_args()
    result = run_checks(args.base_url, args.public_path, args.timeout_seconds)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
