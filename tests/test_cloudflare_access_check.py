from scripts.check_cloudflare_access import (
    DEFAULT_PROTECTED_PATHS,
    HttpProbe,
    classify_protected,
    classify_public,
    parse_headers,
)


def test_parse_headers_uses_final_response_block() -> None:
    status, headers = parse_headers(
        "HTTP/2 100 Continue\r\n\r\n"
        "HTTP/2 302 Found\r\n"
        "location: https://team.cloudflareaccess.com/cdn-cgi/access/login\r\n"
        "cf-ray: test\r\n\r\n"
    )

    assert status == 302
    assert headers["location"] == "https://team.cloudflareaccess.com/cdn-cgi/access/login"


def test_default_protected_paths_include_react_api_and_sse_surfaces() -> None:
    assert "/app" in DEFAULT_PROTECTED_PATHS
    assert "/results" in DEFAULT_PROTECTED_PATHS
    assert "/api/health" in DEFAULT_PROTECTED_PATHS
    assert "/api/config" in DEFAULT_PROTECTED_PATHS
    assert "/api/runs/access-gate-probe/events" in DEFAULT_PROTECTED_PATHS


def test_public_route_rejects_access_challenge() -> None:
    result = classify_public(
        HttpProbe(
            url="https://arabesque.cc/",
            status=302,
            headers={"location": "https://team.cloudflareaccess.com/cdn-cgi/access/login"},
            body_sample="",
        )
    )

    assert result["ok"] is False
    assert result["access_detected"] is True


def test_protected_route_accepts_cloudflare_access_redirect() -> None:
    result = classify_protected(
        HttpProbe(
            url="https://arabesque.cc/app",
            status=302,
            headers={"location": "https://team.cloudflareaccess.com/cdn-cgi/access/login"},
            body_sample="",
        )
    )

    assert result["ok"] is True


def test_protected_route_rejects_public_origin_response() -> None:
    result = classify_protected(
        HttpProbe(
            url="https://arabesque.cc/api/config",
            status=200,
            headers={"content-type": "application/json"},
            body_sample='{"apiBaseUrl":"/api"}',
        )
    )

    assert result["ok"] is False
    assert result["access_detected"] is False


def test_protected_route_rejects_bare_origin_forbidden() -> None:
    result = classify_protected(
        HttpProbe(
            url="https://arabesque.cc/api/config",
            status=403,
            headers={"server": "uvicorn"},
            body_sample='{"detail":"Forbidden"}',
        )
    )

    assert result["ok"] is False
    assert result["access_detected"] is False


def test_protected_route_accepts_access_forbidden_with_marker() -> None:
    result = classify_protected(
        HttpProbe(
            url="https://arabesque.cc/api/config",
            status=403,
            headers={"server": "cloudflare"},
            body_sample="Cloudflare Access denied",
        )
    )

    assert result["ok"] is True
    assert result["access_detected"] is True
