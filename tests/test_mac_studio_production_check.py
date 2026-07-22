from pathlib import Path

from scripts.check_mac_studio_production import (
    check_env,
    check_paths,
    check_tunnel_files,
    parse_env_values,
)


def test_check_env_reports_presence_without_values() -> None:
    dotenv = {
        "KORESIM_AUTH_BASE_URL": "https://arabesque.cc",
        "KORESIM_AUTH_SECRET": "secret",
        "KORESIM_AUTH_REQUIRED": "true",
        "KORESIM_AUTH_COOKIE_SECURE": "true",
        "KORESIM_AUTH_TEST_LOGIN_ENABLED": "false",
        "LLM_BACKEND": "gemini",
        "GEMINI_API_KEY": "gemini-key",
        "GEMINI_MODEL": "gemini-3-flash-preview",
        "REDIS_URL": "redis://localhost:6379/0",
        "PARQUET_PATH": "/tmp/personas.parquet",
        "RUNTIME_DATA_DIR": "/tmp/runtime",
        "SQLITE_PATH": "/tmp/runtime/koresim.sqlite3",
        "GOOGLE_CLIENT_ID": "client-id",
        "GOOGLE_CLIENT_SECRET": "client-secret",
        "LANGFUSE_PUBLIC_KEY": "public",
        "LANGFUSE_SECRET_KEY": "secret",
    }

    result = check_env(dotenv, {})

    assert result["ok"] is True
    assert result["provider"]["present"]["GEMINI_API_KEY"] is True
    assert "gemini-key" not in str(result)
    assert "client-secret" not in str(result)


def test_check_env_rejects_public_cookie_and_test_login() -> None:
    dotenv = {
        "KORESIM_AUTH_BASE_URL": "https://arabesque.cc",
        "KORESIM_AUTH_SECRET": "secret",
        "KORESIM_AUTH_REQUIRED": "true",
        "KORESIM_AUTH_COOKIE_SECURE": "false",
        "KORESIM_AUTH_TEST_LOGIN_ENABLED": "true",
        "LLM_BACKEND": "gemini",
        "GEMINI_API_KEY": "gemini-key",
        "GEMINI_MODEL": "gemini-3-flash-preview",
        "REDIS_URL": "redis://localhost:6379/0",
        "PARQUET_PATH": "/tmp/personas.parquet",
        "RUNTIME_DATA_DIR": "/tmp/runtime",
        "SQLITE_PATH": "/tmp/runtime/koresim.sqlite3",
        "GOOGLE_CLIENT_ID": "client-id",
        "GOOGLE_CLIENT_SECRET": "client-secret",
        "LANGFUSE_PUBLIC_KEY": "public",
        "LANGFUSE_SECRET_KEY": "secret",
    }

    result = check_env(dotenv, {})

    assert result["ok"] is False
    assert result["expected_values"]["KORESIM_AUTH_COOKIE_SECURE"] is False
    assert result["expected_values"]["KORESIM_AUTH_TEST_LOGIN_ENABLED"] is False


def test_check_env_accepts_openai_with_openai_api_key_only() -> None:
    dotenv = {
        "KORESIM_AUTH_BASE_URL": "https://arabesque.cc",
        "KORESIM_AUTH_SECRET": "secret",
        "KORESIM_AUTH_REQUIRED": "true",
        "KORESIM_AUTH_COOKIE_SECURE": "true",
        "KORESIM_AUTH_TEST_LOGIN_ENABLED": "false",
        "LLM_BACKEND": "openai",
        "OPENAI_API_KEY": "sk-test",
        "REDIS_URL": "redis://localhost:6379/0",
        "PARQUET_PATH": "/tmp/personas.parquet",
        "RUNTIME_DATA_DIR": "/tmp/runtime",
        "SQLITE_PATH": "/tmp/runtime/koresim.sqlite3",
        "GOOGLE_CLIENT_ID": "client-id",
        "GOOGLE_CLIENT_SECRET": "client-secret",
        "LANGFUSE_PUBLIC_KEY": "public",
        "LANGFUSE_SECRET_KEY": "secret",
    }

    result = check_env(dotenv, {})

    assert result["ok"] is True
    assert result["provider"]["backend"] == "openai"
    assert result["provider"]["present"]["MONO_OR_OPENAI_API_KEY"] is True
    assert "sk-test" not in str(result)


def test_check_env_accepts_upstage_solar_without_gemini_credentials() -> None:
    dotenv = {
        "KORESIM_AUTH_BASE_URL": "https://arabesque.cc",
        "KORESIM_AUTH_SECRET": "secret",
        "KORESIM_AUTH_REQUIRED": "true",
        "KORESIM_AUTH_COOKIE_SECURE": "true",
        "KORESIM_AUTH_TEST_LOGIN_ENABLED": "false",
        "LLM_BACKEND": "upstage",
        "UPSTAGE_API_KEY": "upstage-key",
        "UPSTAGE_MODEL": "solar-pro2",
        "REDIS_URL": "redis://localhost:6379/0",
        "PARQUET_PATH": "/tmp/personas.parquet",
        "RUNTIME_DATA_DIR": "/tmp/runtime",
        "SQLITE_PATH": "/tmp/runtime/koresim.sqlite3",
        "GOOGLE_CLIENT_ID": "client-id",
        "GOOGLE_CLIENT_SECRET": "client-secret",
        "LANGFUSE_PUBLIC_KEY": "public",
        "LANGFUSE_SECRET_KEY": "secret",
    }

    result = check_env(dotenv, {})

    assert result["ok"] is True
    assert result["provider"] == {
        "backend": "upstage",
        "present": {"UPSTAGE_API_KEY": True, "UPSTAGE_MODEL": True},
    }
    assert "upstage-key" not in str(result)


def test_parse_env_values_handles_export_and_comments(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "# ignored",
                "export REDIS_URL=redis://localhost:6379/0",
                "EMPTY=",
            ]
        ),
        encoding="utf-8",
    )

    assert parse_env_values(env_file) == {
        "REDIS_URL": "redis://localhost:6379/0",
        "EMPTY": "",
    }


def test_check_paths_reports_runtime_artifacts(tmp_path: Path, monkeypatch) -> None:
    project_root = tmp_path / "project"
    react_dist = project_root / "frontend" / "dist"
    react_dist.mkdir(parents=True)
    (react_dist / "index.html").write_text("<div></div>", encoding="utf-8")
    monkeypatch.setattr("scripts.check_mac_studio_production.PROJECT_ROOT", project_root)

    parquet = tmp_path / "personas.parquet"
    parquet.write_text("placeholder", encoding="utf-8")
    runtime = tmp_path / "runtime"
    runtime.mkdir()

    result = check_paths(
        {
            "PARQUET_PATH": str(parquet),
            "RUNTIME_DATA_DIR": str(runtime),
            "SQLITE_PATH": str(runtime / "koresim.sqlite3"),
        },
        {},
    )

    assert result["ok"] is True
    assert result["checks"]["persona_parquet"] is True
    assert result["checks"]["react_build"] is True


def test_check_tunnel_files_requires_config_and_credentials(tmp_path: Path) -> None:
    credentials = tmp_path / "tunnel.json"
    credentials.write_text("{}", encoding="utf-8")
    config = tmp_path / "config.yml"
    config.write_text(
        f"tunnel: demo\ncredentials-file: {credentials}\ningress:\n  - service: http_status:404\n",
        encoding="utf-8",
    )

    result = check_tunnel_files(config)

    assert result["ok"] is True
    assert result["checks"]["config"] is True
    assert result["checks"]["credentials"] is True
