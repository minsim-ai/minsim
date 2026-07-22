from src.api.main import _is_public_path


def test_dgist_route_is_gone():
    """여론조사는 /projects 생성 갈래로 통합됐다. /dgist 전용 공개 경로는 없다."""
    assert _is_public_path("/dgist") is False


def test_protected_paths_stay_protected():
    assert _is_public_path("/app") is False
    assert _is_public_path("/projects") is False
    assert _is_public_path("/results") is False
    assert _is_public_path("/api/runs") is False


def test_login_page_is_public():
    assert _is_public_path("/login") is True


def test_landing_static_assets_are_public():
    """로그아웃 방문자의 랜딩에 필요한 정적 폴더는 전부 공개여야 한다.

    /lordicon/ 이 빠져 있어 랜딩 아이콘 5개가 Google OAuth로 303 리다이렉트되고
    CORS로 죽었다 (2026-07-21 프로덕션 관측).
    """
    for path in ("/assets/x.js", "/fonts/x.woff2", "/landing/x.png", "/lordicon/input.json"):
        assert _is_public_path(path) is True, path
