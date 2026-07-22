"""Validate Cloudflare Access protection for the external demo routes."""
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
DEFAULT_PUBLIC_PATHS = ("/",)
DEFAULT_PROTECTED_PATHS = (
    "/app",
    "/results",
    "/api/health",
    "/api/config",
    "/api/runs/access-gate-probe/events",
)


@dataclass(frozen=True)
class HttpProbe:
    url: str
    status: int | None
    headers: dict[str, str]
    body_sample: str
    error: str | None = None


def parse_headers(raw_headers: str) -> tuple[int | None, dict[str, str]]:
    """Parse curl's response headers, keeping the final response block."""
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
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        headers[key.strip().lower()] = value.strip()
    return status, headers


def probe_url(url: str, timeout_seconds: int) -> HttpProbe:
    with tempfile.NamedTemporaryFile() as header_file, tempfile.NamedTemporaryFile() as body_file:
        command = [
            "curl",
            "--silent",
            "--show-error",
            "--max-time",
            str(timeout_seconds),
            "--request",
            "GET",
            "--dump-header",
            header_file.name,
            "--output",
            body_file.name,
            "--user-agent",
            "koresim-access-check/1.0",
            url,
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        if completed.returncode != 0:
            return HttpProbe(url=url, status=None, headers={}, body_sample="", error=completed.stderr.strip())

        header_file.seek(0)
        body_file.seek(0)
        status, headers = parse_headers(header_file.read().decode("utf-8", errors="replace"))
        body = body_file.read().decode("utf-8", errors="replace")
        return HttpProbe(
            url=url,
            status=status,
            headers=headers,
            body_sample=body[:500],
        )


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
    ok = probe.error is None and probe.status is not None and 200 <= probe.status < 400 and not looks_like_access(probe)
    return {
        "ok": ok,
        "expected": "public_origin_response",
        "status": probe.status,
        "access_detected": looks_like_access(probe),
        "error": probe.error,
    }


def classify_protected(probe: HttpProbe) -> dict[str, object]:
    access_detected = probe.error is None and looks_like_access(probe)
    return {
        "ok": access_detected,
        "expected": "cloudflare_access_challenge_or_deny",
        "status": probe.status,
        "access_detected": access_detected,
        "location": probe.headers.get("location"),
        "error": probe.error,
    }


def build_url(base_url: str, path: str) -> str:
    normalized = base_url.rstrip("/") + "/"
    return urljoin(normalized, path.lstrip("/"))


def run_checks(base_url: str, public_paths: Iterable[str], protected_paths: Iterable[str], timeout_seconds: int) -> dict[str, object]:
    public_results = []
    for path in public_paths:
        probe = probe_url(build_url(base_url, path), timeout_seconds)
        public_results.append({"path": path, "url": probe.url, **classify_public(probe)})

    protected_results = []
    for path in protected_paths:
        probe = probe_url(build_url(base_url, path), timeout_seconds)
        protected_results.append({"path": path, "url": probe.url, **classify_protected(probe)})

    ok = all(result["ok"] for result in [*public_results, *protected_results])
    return {
        "ok": ok,
        "base_url": base_url,
        "public": public_results,
        "protected": protected_results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://arabesque.cc")
    parser.add_argument("--timeout-seconds", type=int, default=15)
    parser.add_argument("--public-path", action="append", default=list(DEFAULT_PUBLIC_PATHS))
    parser.add_argument(
        "--protected-path",
        action="append",
        default=list(DEFAULT_PROTECTED_PATHS),
    )
    args = parser.parse_args()

    result = run_checks(
        base_url=args.base_url,
        public_paths=args.public_path,
        protected_paths=args.protected_path,
        timeout_seconds=args.timeout_seconds,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
