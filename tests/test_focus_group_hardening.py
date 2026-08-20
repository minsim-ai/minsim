"""Hardening regression: fail-closed job, stale reclaim, quality gate."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.api.schemas import FocusGroupCreateRequest, RunCreateRequest
from src.jobs.models import RunStatusValue
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMResponse
from src.services.focus_group_service import (
    FOCUS_GROUP_STALE_AFTER_SECONDS,
    FocusGroupService,
    execute_focus_group_job,
)


def _user(store: SQLiteRunStore, email: str = "hard@example.com"):
    return store.upsert_user_from_auth(
        {
            "id": "test-user",
            "email": email,
            "name": "Hard",
            "provider": "test",
        }
    )


def _seed_run(store: SQLiteRunStore, user, run_id: str = "run-hard"):
    project = store.create_project(user=user, name="hard")
    run = store.create_run(
        RunCreateRequest.model_validate(
            {
                "simulation_type": "open_survey",
                "input": {"question": "Q?", "options": ["찬성", "반대"]},
                "sample_size": 12,
                "seed": 1,
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
        run_label=None,
    )
    store.update_run_status(run.run_id, RunStatusValue.COMPLETED, done_count=12)
    raw = []
    for i in range(10):
        uuid = f"p{i:02d}"
        raw.append(
            {
                "uuid": uuid,
                "response": '{"choice":"찬성","reason":"r"}',
                "parsed": {"choice": "찬성", "reason": "r"},
                "persona": {
                    "uuid": uuid,
                    "age": 20,
                    "sex": "여",
                    "province": "서울",
                    "occupation": "학생",
                    "education_level": "대학교",
                    "persona": "학생",
                },
            }
        )
    store.save_result(
        run.run_id,
        {
            "schema_version": "result-envelope/v1",
            "run_id": run.run_id,
            "simulation_type": "open_survey",
            "status": "completed",
            "seed": 1,
            "sample_size": 12,
            "total_responses": 10,
            "parse_failed": 0,
            "target_filter": {},
            "sample_summary": {},
            "quality": {},
            "warnings": [],
            "metrics": {
                "question": "Q?",
                "options": ["찬성", "반대"],
                "choice_counts": {"찬성": 10, "반대": 0},
            },
            "segments": {},
            "insights": [],
            "raw_results": raw,
            "country_id": "kr",
        },
    )
    return project.project_id, run.run_id


class _BoomClient:
    async def generate(self, request):  # pragma: no cover - should not be called if init fails first
        raise AssertionError("should not generate")


def test_client_init_failure_marks_failed(tmp_path, monkeypatch):
    store = SQLiteRunStore(tmp_path / "h1.sqlite3")
    store.init_db()
    user = _user(store)
    project_id, run_id = _seed_run(store, user, "run-init")

    rec = store.create_focus_group(
        user_id=user.user_id,
        project_id=project_id,
        run_id=run_id,
        config={"question": "Q?", "options": ["찬성", "반대"], "cohort_option": "찬성"},
        panel=[{"uuid": "p00", "display_name": "A", "persona": {"uuid": "p00"}, "initial_choice": "찬성"}],
        progress={},
    )

    def _boom_factory():
        raise RuntimeError("llm_unavailable")

    monkeypatch.setattr("src.llm.factory.create_llm_client", _boom_factory)
    out = execute_focus_group_job(rec.focus_group_id, store=store, llm_client=None)
    assert out["status"] == "failed"
    saved = store.get_focus_group_by_id(rec.focus_group_id)
    assert saved is not None
    assert saved.status == "failed"
    assert "llm_unavailable" in (saved.error or "")


def test_stale_active_reclaim_allows_new_create(tmp_path):
    store = SQLiteRunStore(tmp_path / "h2.sqlite3")
    store.init_db()
    user = _user(store, "stale@example.com")
    project_id, run_id = _seed_run(store, user, "run-stale")

    stuck = store.create_focus_group(
        user_id=user.user_id,
        project_id=project_id,
        run_id=run_id,
        config={"cohort_option": "찬성"},
        panel=[],
        progress={},
    )
    store.update_focus_group(stuck.focus_group_id, status="running")
    # Backdate updated_at past stale window
    old = (datetime.now(UTC) - timedelta(seconds=FOCUS_GROUP_STALE_AFTER_SECONDS + 120)).isoformat()
    with store._connect() as conn:
        conn.execute(
            "UPDATE focus_groups SET updated_at = ? WHERE focus_group_id = ?",
            (old, stuck.focus_group_id),
        )

    class _OkLLM:
        async def generate(self, request) -> LLMResponse:
            phase = (request.metadata or {}).get("phase")
            if phase == "final_stance":
                return LLMResponse(
                    content='{"final_choice":"찬성","reason":"ok","influenced_by":"없음"}',
                    provider="fake",
                    provider_model="fake",
                )
            return LLMResponse(content="발언입니다.", provider="fake", provider_model="fake")

    svc = FocusGroupService(store, run_inline=True, stale_after_seconds=FOCUS_GROUP_STALE_AFTER_SECONDS)
    created = svc.create_focus_group(
        user,
        project_id,
        run_id,
        FocusGroupCreateRequest(cohort_option="찬성"),
        llm_client=_OkLLM(),
    )
    assert created.status == "completed"
    old_row = store.get_focus_group_by_id(stuck.focus_group_id)
    assert old_row is not None
    assert old_row.status == "failed"
    assert "stale" in (old_row.error or "")


def test_all_unparsed_finals_fail_session(tmp_path):
    store = SQLiteRunStore(tmp_path / "h3.sqlite3")
    store.init_db()
    user = _user(store, "parse@example.com")
    project_id, run_id = _seed_run(store, user, "run-parse")

    class _BadFinalLLM:
        async def generate(self, request) -> LLMResponse:
            phase = (request.metadata or {}).get("phase")
            if phase == "final_stance":
                return LLMResponse(content="그냥 말로 할게요", provider="fake", provider_model="fake")
            return LLMResponse(content="오프닝/반응 발언", provider="fake", provider_model="fake")

    svc = FocusGroupService(store, run_inline=True)
    out = svc.create_focus_group(
        user,
        project_id,
        run_id,
        FocusGroupCreateRequest(cohort_option="찬성"),
        llm_client=_BadFinalLLM(),
    )
    assert out.status == "failed"
    assert out.error == "all_final_stances_unparsed"


def test_worker_raises_after_domain_failure(tmp_path, monkeypatch):
    store = SQLiteRunStore(tmp_path / "h5.sqlite3")
    store.init_db()
    user = _user(store, "worker@example.com")
    project_id, run_id = _seed_run(store, user, "run-worker")
    rec = store.create_focus_group(
        user_id=user.user_id,
        project_id=project_id,
        run_id=run_id,
        config={"question": "Q?", "options": ["찬성", "반대"], "cohort_option": "찬성"},
        panel=[{"uuid": "p00", "display_name": "A", "persona": {"uuid": "p00"}, "initial_choice": "찬성"}],
        progress={},
    )
    monkeypatch.setattr(
        "src.llm.factory.create_llm_client",
        lambda: (_ for _ in ()).throw(RuntimeError("no_llm")),
    )
    from src.jobs.worker import run_focus_group_job

    try:
        run_focus_group_job(rec.focus_group_id, sqlite_path=str(store.path))
        raise AssertionError("expected RuntimeError")
    except RuntimeError as exc:
        assert "no_llm" in str(exc)
    saved = store.get_focus_group_by_id(rec.focus_group_id)
    assert saved is not None
    assert saved.status == "failed"


def test_atomic_second_create_blocked(tmp_path):
    store = SQLiteRunStore(tmp_path / "h4.sqlite3")
    store.init_db()
    user = _user(store, "race@example.com")
    project_id, run_id = _seed_run(store, user, "run-race")
    store.create_focus_group_if_idle(
        user_id=user.user_id,
        project_id=project_id,
        run_id=run_id,
        config={"cohort_option": "찬성"},
        panel=[],
        progress={},
    )
    try:
        store.create_focus_group_if_idle(
            user_id=user.user_id,
            project_id=project_id,
            run_id=run_id,
            config={"cohort_option": "찬성"},
            panel=[],
            progress={},
        )
        raise AssertionError("expected active guard")
    except ValueError as exc:
        assert str(exc) == "focus_group_active"
