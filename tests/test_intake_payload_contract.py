"""Frontend planner ↔ backend contract: run_ready payloads must be accepted.

Closes the seam behind the 2026-07-16 booth 422: the intake planner said
run_ready while the backend rejected its payload. This harness executes the
REAL frontend planner (via node/vite) across full / blank / minimal input
scenarios for every simulation type and POSTs every run_ready payload to the
real FastAPI app.

Invariants:
- I-A: every payload the planner marks run_ready is accepted by POST /api/runs.
- I-B: every simulation type reaches run_ready on the full scenario.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import create_app
from src.api.schemas import SimulationType
from src.jobs.store import SQLiteRunStore

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"


@pytest.fixture(scope="module")
def exported_walks(tmp_path_factory) -> list[dict]:
    if not (FRONTEND_DIR / "node_modules").exists():
        pytest.fail(
            "frontend/node_modules missing — run `npm --prefix frontend install`; "
            "the intake contract harness requires the real planner."
        )
    out_path = tmp_path_factory.mktemp("intake-contract") / "payloads.json"
    result = subprocess.run(
        ["node", "scripts/export-intake-payloads.mjs", str(out_path)],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert result.returncode == 0, (
        f"payload export failed:\n{result.stdout}\n{result.stderr}"
    )
    return json.loads(out_path.read_text())


def test_every_type_reaches_run_ready_on_full_inputs(
    exported_walks: list[dict],
) -> None:
    ready_full = {
        walk["simulation_type"]
        for walk in exported_walks
        if walk["scenario"] == "full" and walk["ready"]
    }
    missing = {item.value for item in SimulationType} - ready_full
    assert not missing, (
        f"planner never reached run_ready on full inputs for: {sorted(missing)}"
    )


def test_backend_accepts_every_run_ready_payload(
    tmp_path, exported_walks: list[dict]
) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(
        create_app(store=store, enqueue_run_func=lambda run_id: "job-1")
    )

    ready_walks = [walk for walk in exported_walks if walk["ready"]]
    assert ready_walks, "harness produced no run_ready payloads"

    rejections: list[str] = []
    for walk in ready_walks:
        response = client.post("/api/runs", json=walk["payload"])
        if response.status_code != 200:
            rejections.append(
                f"{walk['simulation_type']}/{walk['scenario']} -> "
                f"{response.status_code}: {response.text[:300]}"
            )
    assert not rejections, (
        "planner said run_ready but the backend rejected the payload "
        "(the 2026-07-16 booth failure class):\n" + "\n".join(rejections)
    )


def test_project_run_accepts_startup_payload_with_selected_pool(
    tmp_path, monkeypatch, exported_walks: list[dict]
) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", "owner@example.com")
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(
        create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}")
    )
    assert client.get("/api/auth/test-login", follow_redirects=False).status_code == 303
    project = client.post(
        "/api/projects", json={"name": "애견인 통합 플랫폼 검증"}
    ).json()
    payload = next(
        walk["payload"]
        for walk in exported_walks
        if walk["simulation_type"] == "startup_item_validation"
        and walk["scenario"] == "project"
    )
    response = client.post(
        f"/api/projects/{project['project_id']}/runs",
        json={
            **payload,
            "sample_size": 200,
            "persona_pool": "dgist",
            "country_id": "kr",
        },
    )
    assert response.status_code == 200, response.text
