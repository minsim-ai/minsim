import pytest

from src.api.schemas import RunCreateRequest
from src.jobs.models import RunEventType, RunStatusValue
from src.jobs.store import SQLiteRunStore


def _request(sample_size: int = 4) -> RunCreateRequest:
    return RunCreateRequest.model_validate(
        {
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "sample_size": sample_size,
            "target_filter": {"province": ["Seoul"]},
            "seed": 123,
        }
    )


def test_sqlite_store_persists_run_across_store_instances(tmp_path) -> None:
    path = tmp_path / "runtime" / "runs.sqlite3"
    store = SQLiteRunStore(path)

    run = store.create_run(_request(), run_id="run-1")

    assert path.exists()
    assert run.status == RunStatusValue.QUEUED
    assert run.sample_size == 4

    reloaded = SQLiteRunStore(path).get_run("run-1")
    assert reloaded is not None
    assert reloaded.seed == 123
    assert reloaded.target_filter == {"province": ["Seoul"], "exclude_unemployed": False}


def test_sqlite_store_persists_run_intake_context(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    request = RunCreateRequest.model_validate(
        {
            "simulation_type": "creative_testing",
            "input": {"creatives": ["concept A", "concept B"]},
            "intake_context": {
                "intake_session_id": "intake-store",
                "safe_intake_summary": {
                    "user_goal": "헤드라인 테스트",
                    "decision_question": "어떤 문구가 좋은가?",
                    "simulation_type": "creative_testing",
                    "user_provided": {"product_description": "AI 리서치 SaaS"},
                },
            },
        }
    )

    store.create_run(request, run_id="run-intake")
    reloaded = SQLiteRunStore(tmp_path / "runs.sqlite3").get_run("run-intake")

    assert reloaded is not None
    assert reloaded.intake_context is not None
    assert reloaded.intake_context["safe_intake_summary"]["user_goal"] == "헤드라인 테스트"


def test_sqlite_store_registers_user_and_tracks_free_run_usage(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user = {
        "id": "google-123",
        "email": "new@example.com",
        "name": "New User",
        "provider": "google",
    }

    registered = store.upsert_user_from_auth(user, free_run_limit=5)
    usage = store.get_user_usage(registered.user_id)

    assert registered.email == "new@example.com"
    assert registered.plan == "free"
    assert usage.free_run_limit == 5
    assert usage.used_runs == 0
    assert usage.remaining_runs == 5
    assert usage.can_create_run is True

    unlimited = store.upsert_user_from_auth(user, free_run_limit=0)
    unlimited_usage = store.get_user_usage(unlimited.user_id)
    assert unlimited_usage.free_run_limit == 0
    assert unlimited_usage.can_create_run is True
    # Re-apply capped limit for the remainder of the ledger assertions.
    registered = store.upsert_user_from_auth(user, free_run_limit=5)

    run = store.create_run(_request(sample_size=2), run_id="quota-run-1", user=registered)
    assert run.user_id == registered.user_id
    assert run.user_email == "new@example.com"

    store.reserve_free_run(registered.user_id, run.run_id, reason="legacy_queued")
    usage_after_reserve = store.get_user_usage(registered.user_id)
    assert usage_after_reserve.used_runs == 0
    assert usage_after_reserve.remaining_runs == 5

    store.complete_free_run(registered.user_id, run.run_id, reason="run_completed")
    store.complete_free_run(registered.user_id, run.run_id, reason="run_completed_duplicate")
    usage_after_completion = store.get_user_usage(registered.user_id)
    assert usage_after_completion.used_runs == 1
    assert usage_after_completion.remaining_runs == 4


def test_sqlite_store_supports_admin_quota_adjustment_and_user_run_history(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user = store.upsert_user_from_auth(
        {
            "id": "google-admin-target",
            "email": "quota-target@example.com",
            "name": "Quota Target",
            "provider": "google",
        },
        free_run_limit=5,
    )
    first_run = store.create_run(_request(sample_size=2), run_id="quota-history-1", user=user)
    second_run = store.create_run(_request(sample_size=2), run_id="quota-history-2", user=user)
    store.complete_free_run(user.user_id, first_run.run_id, reason="run_completed")
    store.complete_free_run(user.user_id, second_run.run_id, reason="run_completed")

    adjusted = store.adjust_free_runs(user.user_id, delta=-1, reason="support_credit")
    found = store.get_user_by_email("quota-target@example.com")
    history = store.list_runs_for_user(user.user_id)

    assert found == user
    assert adjusted.used_runs == 1
    assert adjusted.remaining_runs == 4
    assert [run.run_id for run in history] == ["quota-history-2", "quota-history-1"]

    reset = store.reset_free_run_usage(user.user_id, reason="support_reset")
    assert reset.used_runs == 0
    assert reset.remaining_runs == 5


def test_sqlite_store_updates_events_partials_and_final_result(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=2), run_id="run-2")

    running = store.update_run_status(
        "run-2",
        RunStatusValue.RUNNING,
        done_count=1,
        started_at="2026-05-02T00:00:00+00:00",
    )
    event = store.append_event("run-2", RunEventType.PROGRESS, {"done": 1})
    store.upsert_partial_result("run-2", "persona-1", {"score": 5})
    result = store.save_result("run-2", {"run_id": "run-2", "status": "completed"})
    events = store.list_events("run-2")

    assert running.status == RunStatusValue.RUNNING
    assert running.done_count == 1
    assert event.event_type == RunEventType.PROGRESS
    assert [event.event_type for event in events] == [
        RunEventType.CREATED,
        RunEventType.QUEUED,
        RunEventType.PROGRESS,
    ]
    assert result.result["status"] == "completed"
    assert store.has_result("run-2") is True
    assert store.get_result("run-2").result["run_id"] == "run-2"


def test_sqlite_store_replays_events_after_numeric_cursor(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=2), run_id="run-replay")
    first_progress = store.append_event("run-replay", RunEventType.PROGRESS, {"done": 1})
    second_progress = store.append_event("run-replay", RunEventType.PROGRESS, {"done": 2})

    replayed = store.list_events_after("run-replay", first_progress.event_id)

    assert replayed == [second_progress]


def test_sqlite_store_bulk_upserts_partial_results(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=3), run_id="run-bulk")

    store.upsert_partial_results_bulk(
        "run-bulk",
        [
            ("persona-1", {"uuid": "persona-1", "score": 1}),
            ("persona-2", {"uuid": "persona-2", "score": 2}),
        ],
    )
    store.upsert_partial_results_bulk(
        "run-bulk", [("persona-1", {"uuid": "persona-1", "score": 9})]
    )
    store.upsert_partial_results_bulk("run-bulk", [])

    partials = store.list_partial_results("run-bulk")
    assert {item["uuid"]: item["score"] for item in partials} == {
        "persona-1": 9,
        "persona-2": 2,
    }


def test_sqlite_store_get_run_status_returns_status_only(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=2), run_id="run-status")
    store.update_run_status("run-status", RunStatusValue.CANCELED)

    assert store.get_run_status("run-status") == RunStatusValue.CANCELED
    assert store.get_run_status("missing-run") is None


def test_sqlite_store_upserts_partial_results_and_marks_running_interrupted(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=2), run_id="run-partial")
    store.update_run_status("run-partial", RunStatusValue.RUNNING, done_count=1)

    store.upsert_partial_result("run-partial", "persona-1", {"uuid": "persona-1", "score": 1})
    store.upsert_partial_result("run-partial", "persona-1", {"uuid": "persona-1", "score": 2})
    interrupted = store.mark_active_runs_interrupted(reason="test")

    assert store.list_partial_results("run-partial") == [{"uuid": "persona-1", "score": 2}]
    assert [run.run_id for run in interrupted] == ["run-partial"]
    run = store.get_run("run-partial")
    assert run.status == RunStatusValue.INTERRUPTED
    assert run.error["code"] == "WORKER_INTERRUPTED"
    assert store.list_events("run-partial")[-1].event_type == RunEventType.INTERRUPTED


def test_sqlite_store_persists_intake_session_snapshot_and_events(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")

    created = store.save_intake_session(
        session_id="intake-1",
        status="collecting",
        snapshot={
            "messages": [{"role": "user", "content": "헤드라인 만들고 싶어요"}],
            "slots": {},
        },
        event_type="session_created",
    )
    updated = store.save_intake_session(
        session_id="intake-1",
        status="ready",
        snapshot={
            "messages": [{"role": "user", "content": "헤드라인 만들고 싶어요"}],
            "slots": {"product_description": {"value": "블로그 작성 프로그램"}},
        },
        event_type="session_updated",
    )

    reloaded = SQLiteRunStore(tmp_path / "runs.sqlite3").get_intake_session("intake-1")
    events = store.list_intake_events("intake-1")

    assert created.session_id == "intake-1"
    assert updated.status == "ready"
    assert reloaded is not None
    assert reloaded.snapshot["slots"]["product_description"]["value"] == "블로그 작성 프로그램"
    assert [event.event_type for event in events] == ["session_created", "session_updated"]


def test_sqlite_store_scopes_intake_history_by_user(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user_a = store.upsert_user_from_auth(
        {"id": "user-a", "email": "a@example.com", "name": "A", "provider": "google"}
    )
    user_b = store.upsert_user_from_auth(
        {"id": "user-b", "email": "b@example.com", "name": "B", "provider": "google"}
    )
    store.save_intake_session(
        session_id="intake-user-a",
        status="collecting",
        snapshot={"messages": [{"role": "user", "content": "A의 상세페이지"}]},
        user=user_a,
    )
    store.save_intake_session(
        session_id="intake-user-b",
        status="collecting",
        snapshot={"messages": [{"role": "user", "content": "B의 가격"}]},
        user=user_b,
    )

    user_a_history = store.list_intake_history(user_id=user_a.user_id)
    user_b_history = store.list_intake_history(user_id=user_b.user_id)

    assert [item.session_id for item in user_a_history] == ["intake-user-a"]
    assert [item.session_id for item in user_b_history] == ["intake-user-b"]
    assert store.get_intake_session("intake-user-a", user_id=user_b.user_id) is None
    assert store.get_intake_session("intake-user-a") is None
    assert store.list_intake_sessions() == []


def test_sqlite_store_rejects_cross_user_intake_run_link(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user_a = store.upsert_user_from_auth(
        {"id": "link-user-a", "email": "link-a@example.com", "name": "A", "provider": "google"}
    )
    user_b = store.upsert_user_from_auth(
        {"id": "link-user-b", "email": "link-b@example.com", "name": "B", "provider": "google"}
    )
    store.save_intake_session(
        session_id="intake-link-a",
        status="ready",
        snapshot={"messages": [{"role": "user", "content": "A의 시뮬레이션"}]},
        user=user_a,
    )
    store.create_run(_request(), run_id="run-link-a", user=user_a)
    store.create_run(_request(), run_id="run-link-b", user=user_b)

    linked = store.attach_intake_run(
        session_id="intake-link-a",
        run_id="run-link-a",
        user_id=user_a.user_id,
    )

    assert linked.run_id == "run-link-a"
    with pytest.raises(KeyError):
        store.attach_intake_run(
            session_id="intake-link-a",
            run_id="run-link-b",
            user_id=user_a.user_id,
        )


def test_sqlite_store_lists_recent_intake_sessions(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.save_intake_session(
        session_id="intake-old",
        status="collecting",
        snapshot={"messages": [{"role": "user", "content": "이전 대화"}]},
    )
    store.save_intake_session(
        session_id="intake-new",
        status="ready",
        snapshot={"messages": [{"role": "user", "content": "최근 대화"}]},
    )

    sessions = store.list_intake_sessions(limit=1)

    assert [session.session_id for session in sessions] == ["intake-new"]
    assert sessions[0].snapshot["messages"][0]["content"] == "최근 대화"


def test_sqlite_store_persists_intake_chat_history_and_run_link(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.save_intake_session(
        session_id="intake-chat",
        status="ready",
        snapshot={
            "messages": [
                {"role": "assistant", "content": "어떤 결정을 돕고 싶으신가요?"},
                {"role": "user", "content": "상세페이지 헤드라인을 만들고 싶어요"},
                {"role": "assistant", "content": "어떤 제품인가요?"},
            ],
            "slots": {},
        },
    )
    store.create_run(_request(), run_id="run-from-chat")
    linked = store.attach_intake_run(session_id="intake-chat", run_id="run-from-chat")

    history = store.list_intake_history(limit=5)

    assert linked.run_id == "run-from-chat"
    assert history[0].session_id == "intake-chat"
    assert history[0].title == "상세페이지 헤드라인을 만들고 싶어요"
    assert history[0].run_id == "run-from-chat"
    assert [message.content for message in history[0].messages] == [
        "어떤 결정을 돕고 싶으신가요?",
        "상세페이지 헤드라인을 만들고 싶어요",
        "어떤 제품인가요?",
    ]


def test_sqlite_store_persists_agent_runs_for_improvement_loop(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=2), run_id="run-agent")

    saved = store.save_agent_run(
        run_id="run-agent",
        agent_name="analysis",
        task_type="analysis",
        prompt_version="analysis:v1",
        mode="llm",
        safe_input={"simulation_type": "creative_testing", "metrics": {"choice_counts": {"A": 2}}},
        output={"summary": "A wins", "key_findings": ["A is preferred"]},
        scores={"schema_valid": True, "no_raw_leak": True},
        provider="fake",
        provider_model="fake-analysis",
        trace_id="trace-analysis",
    )

    rows = SQLiteRunStore(tmp_path / "runs.sqlite3").list_agent_runs("run-agent")

    assert saved.agent_name == "analysis"
    assert len(saved.safe_input_digest) == 64
    assert rows == [saved]
    assert rows[0].output["summary"] == "A wins"
    assert rows[0].scores["schema_valid"] is True
    assert rows[0].provider_model == "fake-analysis"


def test_sqlite_store_persists_orchestration_checkpoints(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    store.create_run(_request(sample_size=2), run_id="run-checkpoint")

    saved = store.save_orchestration_checkpoint(
        run_id="run-checkpoint",
        graph_name="run_scaffold",
        checkpoint_name="qa",
        state={"steps": ["prepare", "execute", "analyze", "report", "qa"]},
    )

    rows = SQLiteRunStore(tmp_path / "runs.sqlite3").list_orchestration_checkpoints(
        "run-checkpoint"
    )
    assert rows == [saved]
    assert rows[0].graph_name == "run_scaffold"
    assert rows[0].state["steps"][-1] == "qa"
