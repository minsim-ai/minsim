"""HTTP contract + result verification for open_survey focus groups."""
from __future__ import annotations

from fastapi.testclient import TestClient

from src.api.main import create_app
from src.api.schemas import RunCreateRequest
from src.jobs.models import RunStatusValue
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMResponse
from src.services.focus_group_service import execute_focus_group_job

TEST_EMAIL = "fg-api@example.com"


class _FakeFocusLLM:
    def __init__(self) -> None:
        self.calls = 0
        self.phases: list[str] = []

    async def generate(self, request) -> LLMResponse:
        self.calls += 1
        phase = str((request.metadata or {}).get("phase") or "")
        self.phases.append(phase)
        if phase == "final_stance":
            uuid = str((request.metadata or {}).get("uuid") or "")
            choice = "반대" if uuid.endswith("00") else "찬성"
            body = (
                f'{{"final_choice":"{choice}",'
                f'"reason":"토론 후 {choice}",'
                f'"influenced_by":"없음"}}'
            )
        else:
            body = f"발언 phase={phase}. 생활 여건을 기준으로 말합니다."
        return LLMResponse(content=body, provider="fake", provider_model="fake-fg")


def _login(client: TestClient, monkeypatch, email: str = TEST_EMAIL) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", email)
    monkeypatch.setenv("KORESIM_AUTH_TEST_NAME", "FG API User")
    response = client.get("/api/auth/test-login", follow_redirects=False)
    assert response.status_code == 303


def _test_auth_user(email: str = TEST_EMAIL) -> dict:
    # Must match src.api.auth.build_test_login_response session payload.
    return {
        "id": "test-user",
        "email": email,
        "name": "FG API User",
        "provider": "test",
    }


def _seed_completed_open_survey(
    store: SQLiteRunStore,
    *,
    run_id: str = "run-fg-api",
    email: str = TEST_EMAIL,
) -> tuple[str, str, dict]:
    user = store.upsert_user_from_auth(_test_auth_user(email))
    project = store.create_project(user=user, name="FG API Project")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "open_survey",
                "input": {"question": "카페 연장?", "options": ["찬성", "반대", "보류"]},
                "sample_size": 20,
                "seed": 5,
            }
        ),
        run_id=run_id,
        user=user,
    )
    store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=user.user_id,
        derived_from_run_id=None,
        run_label="baseline",
    )
    store.update_run_status(
        run.run_id,
        RunStatusValue.COMPLETED,
        done_count=20,
        completed_at="2026-08-04T00:00:00+00:00",
    )
    raw = []
    for i in range(10):
        uuid = f"persona-{i:02d}"
        raw.append(
            {
                "uuid": uuid,
                "response": f'{{"choice":"찬성","reason":"찬성 이유 {i}"}}',
                "parsed": {"choice": "찬성", "reason": f"찬성 이유 {i}"},
                "persona": {
                    "uuid": uuid,
                    "age": 21 + i,
                    "sex": "여",
                    "province": "서울",
                    "occupation": "학생",
                    "education_level": "대학교",
                    "persona": f"{uuid} 학생 페르소나",
                },
            }
        )
    for i in range(3):
        uuid = f"no-{i}"
        raw.append(
            {
                "uuid": uuid,
                "response": '{"choice":"반대","reason":"비용"}',
                "parsed": {"choice": "반대", "reason": "비용"},
                "persona": {
                    "uuid": uuid,
                    "age": 40,
                    "sex": "남",
                    "province": "부산",
                    "occupation": "직원",
                    "education_level": "대학교",
                    "persona": "직원",
                },
            }
        )
    metrics = {
        "question": "카페 연장?",
        "options": ["찬성", "반대", "보류"],
        "choice_counts": {"찬성": 10, "반대": 3, "보류": 0},
        "choice_pct": {"찬성": 76.9, "반대": 23.1, "보류": 0.0},
        "choice_rows": [
            {"option": "찬성", "count": 10, "pct": 76.9},
            {"option": "반대", "count": 3, "pct": 23.1},
            {"option": "보류", "count": 0, "pct": 0.0},
        ],
    }
    envelope = {
        "schema_version": "result-envelope/v1",
        "run_id": run.run_id,
        "simulation_type": "open_survey",
        "status": "completed",
        "seed": 5,
        "sample_size": 20,
        "total_responses": len(raw),
        "parse_failed": 0,
        "target_filter": {},
        "sample_summary": {"sample_size": len(raw)},
        "quality": {"status": "ok"},
        "warnings": [],
        "metrics": metrics,
        "segments": {},
        "insights": [],
        "raw_results": raw,
        "country_id": "kr",
    }
    store.save_result(run.run_id, envelope)
    return project.project_id, run.run_id, metrics


def test_focus_group_api_happy_path_and_schema(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "fg-api.sqlite3")
    store.init_db()
    project_id, run_id, original_metrics = _seed_completed_open_survey(store)
    fake = _FakeFocusLLM()

    def _enqueue(fg_id: str) -> str:
        execute_focus_group_job(fg_id, store=store, llm_client=fake)
        return f"job-{fg_id}"

    app = create_app(
        store=store,
        enqueue_run_func=lambda rid: f"job-{rid}",
        enqueue_focus_group_func=_enqueue,
        llm_client=fake,
    )
    client = TestClient(app)
    _login(client, monkeypatch)

    listed = client.get(f"/api/projects/{project_id}/runs/{run_id}/focus-groups")
    assert listed.status_code == 200, listed.text
    assert listed.json()["focus_groups"] == []

    created = client.post(
        f"/api/projects/{project_id}/runs/{run_id}/focus-groups",
        json={"cohort_option": "찬성", "moderator_prompt": "서로의 이유를 나눠 보세요."},
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["schema_version"] == "focus-group/v1"
    assert body["status"] == "completed"
    assert body["config"]["cohort_option"] == "찬성"
    assert body["config"]["protocol_id"] == "focus_group_round_robin_v1"
    assert body["config"]["panel_size"] == 9
    assert len(body["panel"]) == 9
    assert all("persona" not in member for member in body["panel"])
    assert all(member["initial_choice"] == "찬성" for member in body["panel"])

    timeline = body["timeline"]
    assert timeline[0]["role"] == "moderator"
    assert timeline[0]["round"] == "opening"
    opening = [t for t in timeline if t["role"] == "participant" and t["round"] == "opening"]
    reaction = [t for t in timeline if t["role"] == "participant" and t["round"] == "reaction"]
    assert len(opening) == 9
    assert len(reaction) == 9
    assert max(t["seq"] for t in opening) < min(t["seq"] for t in reaction)

    assert body["stance_table"] and len(body["stance_table"]) == 9
    assert body["summary"]["changed_count"] >= 1
    assert body["summary"]["warnings"]
    assert fake.calls == 27
    assert fake.phases.count("opening") == 9
    assert fake.phases.count("reaction") == 9
    assert fake.phases.count("final_stance") == 9

    got = client.get(
        f"/api/projects/{project_id}/runs/{run_id}/focus-groups/{body['focus_group_id']}"
    )
    assert got.status_code == 200
    assert got.json()["focus_group_id"] == body["focus_group_id"]

    listed2 = client.get(f"/api/projects/{project_id}/runs/{run_id}/focus-groups")
    assert len(listed2.json()["focus_groups"]) == 1

    result = client.get(f"/api/projects/{project_id}/runs/{run_id}/result")
    assert result.status_code == 200
    metrics = result.json()["metrics"]
    assert metrics["choice_counts"] == original_metrics["choice_counts"]
    assert metrics["choice_pct"] == original_metrics["choice_pct"]


def test_focus_group_api_rejects_unknown_option_and_small_cohort(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "fg-api-guards.sqlite3")
    store.init_db()
    project_id, run_id, _ = _seed_completed_open_survey(store, run_id="run-fg-guards")
    app = create_app(
        store=store,
        enqueue_run_func=lambda rid: f"job-{rid}",
        focus_group_run_inline=True,
        llm_client=_FakeFocusLLM(),
    )
    client = TestClient(app)
    _login(client, monkeypatch)

    bad_option = client.post(
        f"/api/projects/{project_id}/runs/{run_id}/focus-groups",
        json={"cohort_option": "없는선택"},
    )
    assert bad_option.status_code == 400

    small = client.post(
        f"/api/projects/{project_id}/runs/{run_id}/focus-groups",
        json={"cohort_option": "반대"},
    )
    assert small.status_code == 400
    assert "9" in small.json()["detail"]["message"]


def test_focus_group_api_rejects_non_open_survey(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "fg-api-ct.sqlite3")
    store.init_db()
    user = store.upsert_user_from_auth(_test_auth_user("ct@example.com"))
    project = store.create_project(user=user, name="ct")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "creative_testing",
                "input": {"creatives": ["A", "B"]},
                "sample_size": 3,
                "seed": 1,
            }
        ),
        run_id="run-ct",
        user=user,
    )
    store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=user.user_id,
        derived_from_run_id=None,
        run_label=None,
    )
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=3)
    store.save_result(
        run.run_id,
        {"run_id": run.run_id, "simulation_type": "creative_testing", "metrics": {}, "raw_results": []},
    )

    client = TestClient(
        create_app(store=store, enqueue_run_func=lambda rid: f"job-{rid}", focus_group_run_inline=True)
    )
    _login(client, monkeypatch, "ct@example.com")
    response = client.post(
        f"/api/projects/{project.project_id}/runs/{run.run_id}/focus-groups",
        json={"cohort_option": "A"},
    )
    assert response.status_code == 400
    assert "open_survey" in response.json()["detail"]["message"]


def test_focus_group_create_validation_panel_size(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "fg-api-val.sqlite3")
    store.init_db()
    project_id, run_id, _ = _seed_completed_open_survey(store, run_id="run-val")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda rid: f"job-{rid}"))
    _login(client, monkeypatch)
    response = client.post(
        f"/api/projects/{project_id}/runs/{run_id}/focus-groups",
        json={"cohort_option": "찬성", "panel_size": 8},
    )
    assert response.status_code == 422


def test_focus_group_blocks_second_active_session(tmp_path, monkeypatch) -> None:
    """queued/running session blocks another create (cost guard)."""
    store = SQLiteRunStore(tmp_path / "fg-api-active.sqlite3")
    store.init_db()
    project_id, run_id, _ = _seed_completed_open_survey(store, run_id="run-active")
    user = store.upsert_user_from_auth(_test_auth_user())
    # Insert a stuck running session without finishing it.
    store.create_focus_group(
        user_id=user.user_id,
        project_id=project_id,
        run_id=run_id,
        config={"cohort_option": "찬성", "panel_size": 9},
        panel=[],
        progress={"phase": "opening"},
    )
    store.update_focus_group(
        store.list_focus_groups(user_id=user.user_id, run_id=run_id)[0].focus_group_id,
        status="running",
    )

    client = TestClient(
        create_app(
            store=store,
            enqueue_run_func=lambda rid: f"job-{rid}",
            focus_group_run_inline=True,
            llm_client=_FakeFocusLLM(),
        )
    )
    _login(client, monkeypatch)
    response = client.post(
        f"/api/projects/{project_id}/runs/{run_id}/focus-groups",
        json={"cohort_option": "찬성"},
    )
    assert response.status_code == 409
