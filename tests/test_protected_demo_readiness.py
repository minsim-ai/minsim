from pathlib import Path

from scripts.check_protected_demo_readiness import (
    build_report,
    check_access_prerequisites,
    check_allowlist_file,
    check_google_oauth_client,
    find_secret_files,
    has_any_setting,
    parse_env_names,
    parse_env_values,
)


def test_parse_env_names_reads_only_keys_with_values(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "# ignored",
                "CLOUDFLARE_API_TOKEN=secret-value",
                "CLOUDFLARE_ACCOUNT_ID=",
                "export KORESIM_ACCESS_ALLOWLIST=demo@example.com",
                "CLOUDFLARE_GOOGLE_IDP_ID=google-idp",
            ]
        ),
        encoding="utf-8",
    )

    assert parse_env_names(env_file) == {
        "CLOUDFLARE_API_TOKEN",
        "KORESIM_ACCESS_ALLOWLIST",
        "CLOUDFLARE_GOOGLE_IDP_ID",
    }
    assert parse_env_values(env_file)["KORESIM_ACCESS_ALLOWLIST"] == "demo@example.com"
    assert parse_env_values(env_file)["CLOUDFLARE_ACCOUNT_ID"] == ""


def test_has_any_setting_accepts_env_or_dotenv_names() -> None:
    assert has_any_setting(("MISSING", "PRESENT"), {"PRESENT": "value"}, set()) is True
    assert has_any_setting(("MISSING", "DOTENV_PRESENT"), {}, {"DOTENV_PRESENT"}) is True
    assert has_any_setting(("EMPTY_ENV",), {"EMPTY_ENV": ""}, set()) is False
    assert has_any_setting(("MISSING",), {}, set()) is False


def test_check_access_prerequisites_accepts_account_scope_from_env_names() -> None:
    result = check_access_prerequisites(
        {},
        {
            "CLOUDFLARE_API_TOKEN",
            "CLOUDFLARE_ACCOUNT_ID",
            "KORESIM_ACCESS_ALLOWLIST_FILE",
            "CLOUDFLARE_GOOGLE_IDP_ID",
        },
        require_google_idp=True,
    )

    assert result["ok"] is True
    assert result["account_or_zone_ok"] is True
    assert result["google_idp_ok"] is True


def test_build_report_rejects_empty_dotenv_access_values(tmp_path: Path) -> None:
    for path in [
        "AGENTS.md",
        "CLAUDE.md",
        "docs/runbooks/next-autonomous-implementation.md",
        "docs/runbooks/autonomous-work-session.md",
        "docs/runbooks/cloudflare-tunnel-operations.md",
        "docs/runbooks/llm-gemini-langfuse-operations.md",
        "docs/execution/protected-demo-completion-audit.md",
        "docs/execution/phase-3-access-path-policy.md",
        "scripts/check_cloudflare_access.py",
        "scripts/configure_cloudflare_access.py",
    ]:
        file_path = tmp_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("", encoding="utf-8")

    (tmp_path / ".env").write_text(
        "\n".join(
            [
                "CLOUDFLARE_API_TOKEN=",
                "CLOUDFLARE_ACCOUNT_ID=",
                "KORESIM_ACCESS_ALLOWLIST_FILE=",
                "CLOUDFLARE_GOOGLE_IDP_ID=",
            ]
        ),
        encoding="utf-8",
    )

    report = build_report(tmp_path, {}, require_google_idp=True)

    assert report["ok"] is False
    assert report["access_apply_prerequisites"]["checks"]["CLOUDFLARE_API_TOKEN"] is False
    assert report["access_apply_prerequisites"]["checks"]["CLOUDFLARE_ACCOUNT_ID"] is False
    assert report["access_apply_prerequisites"]["checks"]["allowlist"] is False
    assert report["access_apply_prerequisites"]["google_idp_ok"] is False
    assert report["access_apply_prerequisites"]["sources"]["CLOUDFLARE_API_TOKEN"] == []


def test_check_allowlist_file_reports_configured_missing_file_without_path(tmp_path: Path) -> None:
    result = check_allowlist_file(
        {"KORESIM_ACCESS_ALLOWLIST_FILE": str(tmp_path / "missing.txt")},
        {},
    )

    assert result == {
        "ok": False,
        "configured": True,
        "exists": False,
        "is_file": False,
        "readable": False,
    }


def test_check_allowlist_file_accepts_readable_file(tmp_path: Path) -> None:
    allowlist_file = tmp_path / "allowlist.txt"
    allowlist_file.write_text("demo@example.com\n", encoding="utf-8")

    result = check_allowlist_file({}, {"KORESIM_ACCESS_ALLOWLIST_FILE": str(allowlist_file)})

    assert result == {
        "ok": True,
        "configured": True,
        "exists": True,
        "is_file": True,
        "readable": True,
    }


def test_check_google_oauth_client_reports_rotation_required_without_secret_values() -> None:
    result = check_google_oauth_client(
        {},
        {
            "GOOGLE_OAUTH_CLIENT_ID": "client-id",
            "GOOGLE_OAUTH_CLIENT_SECRET_STATUS": "ROTATE_EXPOSED_SECRET_BEFORE_USE",
        },
        {"GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET_STATUS"},
    )

    assert result["client_id_configured"] is True
    assert result["client_secret_configured"] is False
    assert result["secret_rotation_required"] is True
    assert result["ok_for_idp_apply"] is False
    assert result["sources"]["GOOGLE_OAUTH_CLIENT_ID"] == [".env"]
    assert "client-id" not in str(result)


def test_check_google_oauth_client_accepts_rotated_secret_from_environment() -> None:
    result = check_google_oauth_client(
        {
            "GOOGLE_OAUTH_CLIENT_ID": "client-id",
            "GOOGLE_OAUTH_CLIENT_SECRET": "rotated-secret",
        },
        {},
        set(),
    )

    assert result["client_id_configured"] is True
    assert result["client_secret_configured"] is True
    assert result["secret_rotation_required"] is False
    assert result["ok_for_idp_apply"] is True
    assert result["sources"]["GOOGLE_OAUTH_CLIENT_SECRET"] == ["environment"]
    assert "rotated-secret" not in str(result)


def test_check_access_prerequisites_rejects_missing_allowlist() -> None:
    result = check_access_prerequisites(
        {"CLOUDFLARE_API_TOKEN": "set", "CLOUDFLARE_ZONE_ID": "set"},
        set(),
        require_google_idp=False,
    )

    assert result["ok"] is False
    assert result["checks"]["allowlist"] is False


def test_find_secret_files_detects_oauth_json_without_scanning_skipped_dirs(tmp_path: Path) -> None:
    (tmp_path / "client_secret_demo.json").write_text("{}", encoding="utf-8")
    skipped = tmp_path / "node_modules"
    skipped.mkdir()
    (skipped / "client_secret_ignored.json").write_text("{}", encoding="utf-8")

    assert find_secret_files(tmp_path) == ["client_secret_demo.json"]


def test_build_report_blocks_on_missing_access_prereqs(tmp_path: Path) -> None:
    for path in [
        "AGENTS.md",
        "CLAUDE.md",
        "docs/runbooks/next-autonomous-implementation.md",
        "docs/runbooks/autonomous-work-session.md",
        "docs/runbooks/cloudflare-tunnel-operations.md",
        "docs/runbooks/llm-gemini-langfuse-operations.md",
        "docs/execution/protected-demo-completion-audit.md",
        "docs/execution/phase-3-access-path-policy.md",
        "scripts/check_cloudflare_access.py",
        "scripts/configure_cloudflare_access.py",
    ]:
        file_path = tmp_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("", encoding="utf-8")

    report = build_report(tmp_path, {}, require_google_idp=True)

    assert report["ok"] is False
    assert report["status"] == "blocked"
    assert "Cloudflare Access apply prerequisites are incomplete." in report["blockers"]


def test_build_report_reports_google_oauth_idp_apply_readiness(tmp_path: Path) -> None:
    for path in [
        "AGENTS.md",
        "CLAUDE.md",
        "docs/runbooks/next-autonomous-implementation.md",
        "docs/runbooks/autonomous-work-session.md",
        "docs/runbooks/cloudflare-tunnel-operations.md",
        "docs/runbooks/llm-gemini-langfuse-operations.md",
        "docs/execution/protected-demo-completion-audit.md",
        "docs/execution/phase-3-access-path-policy.md",
        "scripts/check_cloudflare_access.py",
        "scripts/configure_cloudflare_access.py",
    ]:
        file_path = tmp_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("", encoding="utf-8")

    report = build_report(
        tmp_path,
        {
            "CLOUDFLARE_API_TOKEN": "set",
            "CLOUDFLARE_ACCOUNT_ID": "set",
            "KORESIM_ACCESS_ALLOWLIST": "demo@example.com",
            "GOOGLE_OAUTH_CLIENT_ID": "client-id",
            "GOOGLE_OAUTH_CLIENT_SECRET": "rotated-secret",
        },
        require_google_idp=True,
    )

    assert report["ok"] is False
    assert report["status"] == "blocked"
    assert report["access_apply_prerequisites"]["google_idp_ok"] is False
    assert report["google_oauth_client"]["ok_for_idp_apply"] is True
    assert "Cloudflare Google IdP UUID is missing and rotated Google OAuth credentials are not ready for IdP apply." not in report["blockers"]


def test_build_report_blocks_on_missing_allowlist_file_even_when_keys_exist(tmp_path: Path) -> None:
    for path in [
        "AGENTS.md",
        "CLAUDE.md",
        "docs/runbooks/next-autonomous-implementation.md",
        "docs/runbooks/autonomous-work-session.md",
        "docs/runbooks/cloudflare-tunnel-operations.md",
        "docs/runbooks/llm-gemini-langfuse-operations.md",
        "docs/execution/protected-demo-completion-audit.md",
        "docs/execution/phase-3-access-path-policy.md",
        "scripts/check_cloudflare_access.py",
        "scripts/configure_cloudflare_access.py",
    ]:
        file_path = tmp_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("", encoding="utf-8")

    report = build_report(
        tmp_path,
        {
            "CLOUDFLARE_API_TOKEN": "set",
            "CLOUDFLARE_ACCOUNT_ID": "set",
            "KORESIM_ACCESS_ALLOWLIST_FILE": str(tmp_path / "missing.txt"),
            "CLOUDFLARE_GOOGLE_IDP_ID": "set",
        },
        require_google_idp=True,
    )

    assert report["ok"] is False
    assert report["access_apply_prerequisites"]["ok"] is True
    assert report["allowlist_file"]["ok"] is False
    assert "KORESIM_ACCESS_ALLOWLIST_FILE is configured but not readable as a file." in report["blockers"]
