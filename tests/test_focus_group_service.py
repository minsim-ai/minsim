"""Focus group service + store integration (inline execution)."""
from __future__ import annotations

from pathlib import Path

from src.api.schemas import FocusGroupCreateRequest, RunCreateRequest
from src.jobs.models import RunStatusValue
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMResponse
from src.services.errors import ServiceError
from src.services.focus_group_service import FocusGroupService


class _FakeLLM:
    async def generate(self, request) -> LLMResponse:
        phase = (request.metadata or {}).get("phase")
        if phase == "final_stance":
            body = '{"final_choice":"찬성","reason":"유지합니다","influenced_by":"없음"}'
        else:
            body = "생활 여건상 찬성 쪽입니다. 구체적인 이유를 덧붙입니다."
        return LLMResponse(content=body, provider="fake", provider_model="fake")


def _user(store: SQLiteRunStore, suffix: str = "fg"):
    return store.upsert_user_from_auth(
        {
            "id": f"google-{suffix}",
            "email": f"{suffix}@example.com",
            "name": f"User {suffix}",
            "provider": "google",
        }
    )


def _open_survey_request() -> RunCreateRequest:
    return RunCreateRequest.model_validate(
        {
            "simulation_type": "open_survey",
            "input": {"question": "연장할까요?", "options": ["찬성", "반대"]},
            "sample_size": 20,
            "seed": 11,
        }
    )


def _seed_open_survey(store: SQLiteRunStore, user) -> tuple[str, str]:
    project = store.create_project(user=user, name="fg-test")
    run = store.create_run(_open_survey_request(), run_id=f"run-fg-{user.user_id[:6]}", user=user)
    store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=user.user_id,
        derived_from_run_id=None,
        run_label="open survey",
    )
    store.update_run_status(
        run.run_id,
        RunStatusValue.COMPLETED,
        done_count=20,
        completed_at="2026-08-04T00:00:00+00:00",
    )
    raw = []
    for i in range(12):
        uuid = f"persona-{i:02d}"
        raw.append(
            {
                "uuid": uuid,
                "parsed": {"choice": "찬성", "reason": f"이유{i}"},
                "persona": {
                    "uuid": uuid,
                    "age": 20 + i,
                    "sex": "여",
                    "province": "서울",
                    "occupation": "학생",
                    "education_level": "대학교",
                    "persona": f"{uuid} 학생",
                },
            }
        )
    for i in range(5):
        uuid = f"opp-{i}"
        raw.append(
            {
                "uuid": uuid,
                "parsed": {"choice": "반대", "reason": "부담"},
                "persona": {
                    "uuid": uuid,
                    "age": 30,
                    "sex": "남",
                    "province": "부산",
                    "occupation": "직원",
                    "education_level": "대학교",
                    "persona": "직원",
                },
            }
        )
    store.save_result(
        run.run_id,
        {
            "run_id": run.run_id,
            "simulation_type": "open_survey",
            "status": "completed",
            "metrics": {
                "question": "연장할까요?",
                "options": ["찬성", "반대"],
                "choice_counts": {"찬성": 12, "반대": 5},
            },
            "raw_results": raw,
            "country_id": "kr",
        },
    )
    return project.project_id, run.run_id


def test_create_and_complete_focus_group_inline(tmp_path: Path):
    store = SQLiteRunStore(tmp_path / "fg.sqlite3")
    store.init_db()
    user = _user(store, "owner")
    project_id, run_id = _seed_open_survey(store, user)

    svc = FocusGroupService(store, run_inline=True)
    created = svc.create_focus_group(
        user,
        project_id,
        run_id,
        FocusGroupCreateRequest(cohort_option="찬성"),
        llm_client=_FakeLLM(),
    )
    assert created.status == "completed"
    assert len(created.panel) == 9
    assert created.timeline
    assert created.summary is not None
    assert created.summary.get("changed_count") == 0
    # persona blobs must not leak to API panel
    assert all("persona" not in m for m in created.panel)

    listed = svc.list_focus_groups(user, project_id, run_id)
    assert len(listed.focus_groups) == 1

    second = svc.create_focus_group(
        user,
        project_id,
        run_id,
        FocusGroupCreateRequest(cohort_option="찬성", seed=99),
        llm_client=_FakeLLM(),
    )
    assert second.focus_group_id != created.focus_group_id


def test_rejects_non_open_survey(tmp_path: Path):
    store = SQLiteRunStore(tmp_path / "fg2.sqlite3")
    store.init_db()
    user = _user(store, "other")
    project = store.create_project(user=user, name="x")
    payload = RunCreateRequest.model_validate(
        {
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A", "B"]},
            "sample_size": 10,
            "seed": 1,
        }
    )
    run = store.create_run(payload, run_id="run-ct", user=user)
    store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=user.user_id,
        derived_from_run_id=None,
        run_label=None,
    )
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=10)
    store.save_result(
        run.run_id,
        {"run_id": run.run_id, "simulation_type": "creative_testing", "raw_results": []},
    )

    svc = FocusGroupService(store, run_inline=True)
    try:
        svc.create_focus_group(
            user,
            project.project_id,
            run.run_id,
            FocusGroupCreateRequest(cohort_option="A"),
            llm_client=_FakeLLM(),
        )
        raise AssertionError("expected ServiceError")
    except ServiceError as exc:
        assert exc.status_code == 400


def test_rejects_insufficient_cohort(tmp_path: Path):
    store = SQLiteRunStore(tmp_path / "fg3.sqlite3")
    store.init_db()
    user = _user(store, "small")
    project_id, run_id = _seed_open_survey(store, user)
    # only 5 on 반대
    svc = FocusGroupService(store, run_inline=True)
    try:
        svc.create_focus_group(
            user,
            project_id,
            run_id,
            FocusGroupCreateRequest(cohort_option="반대"),
            llm_client=_FakeLLM(),
        )
        raise AssertionError("expected ServiceError")
    except ServiceError as exc:
        assert exc.status_code == 400
        assert "Need at least 9" in exc.message or "found 5" in exc.message
