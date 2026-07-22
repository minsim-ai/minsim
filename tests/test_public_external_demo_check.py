from scripts.check_public_external_demo import (
    DEFAULT_PUBLIC_PATHS,
    HttpProbe,
    classify_public,
    parse_headers,
)


def test_default_public_paths_include_landing_validation_auth_and_safe_api() -> None:
    assert "/" in DEFAULT_PUBLIC_PATHS
    assert "/validation" in DEFAULT_PUBLIC_PATHS
    assert "/api/auth/session" in DEFAULT_PUBLIC_PATHS
    assert "/api/health" in DEFAULT_PUBLIC_PATHS
    assert "/api/config" in DEFAULT_PUBLIC_PATHS


def test_parse_headers_uses_final_response_block() -> None:
    status, headers = parse_headers(
        "HTTP/2 301 Moved Permanently\r\n"
        "location: https://arabesque.cc/app\r\n\r\n"
        "HTTP/2 200 OK\r\n"
        "content-type: text/html; charset=utf-8\r\n\r\n"
    )

    assert status == 200
    assert headers["content-type"] == "text/html; charset=utf-8"


def test_public_route_accepts_origin_response() -> None:
    result = classify_public(
        HttpProbe(
            url="https://arabesque.cc/app",
            status=200,
            headers={"content-type": "text/html; charset=utf-8"},
            body_sample="<html>KoreaSim</html>",
        )
    )

    assert result["ok"] is True
    assert result["access_detected"] is False


def test_public_route_rejects_cloudflare_access_challenge() -> None:
    result = classify_public(
        HttpProbe(
            url="https://arabesque.cc/app",
            status=302,
            headers={"location": "https://team.cloudflareaccess.com/cdn-cgi/access/login"},
            body_sample="",
        )
    )

    assert result["ok"] is False
    assert result["access_detected"] is True
