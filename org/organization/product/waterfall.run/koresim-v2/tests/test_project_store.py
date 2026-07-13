from src.api.schemas import RunCreateRequest
from src.jobs.store import SQLiteRunStore


def _user(store: SQLiteRunStore, suffix: str = "a"):
    return store.upsert_user_from_auth(
        {
            "id": f"google-{suffix}",
            "email": f"{suffix}@example.com",
            "name": f"User {suffix}",
            "provider": "google",
        }
    )


def _request() -> RunCreateRequest:
    return RunCreateRequest.model_validate(
        {
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A", "B"]},
            "sample_size": 3,
            "target_filter": {"province": ["Seoul"]},
            "seed": 123,
        }
    )


def test_project_crud_archive_and_json_fields(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user = _user(store, "owner")

    project = store.create_project(
        user=user,
        name="Ony launch",
        description="Senior care product",
        product_context={"category": "care", "positioning": "family reassurance"},
        features=["daily check-in", "guardian alert"],
        prices=["29000", "49000"],
        target_notes="70+ seniors and family caregivers",
        alternatives=["phone call", "home visit"],
    )

    assert project.project_id
    assert project.user_id == user.user_id
    assert project.product_context["category"] == "care"
    assert project.features == ["daily check-in", "guardian alert"]
    assert project.archived_at is None

    updated = store.update_project(
        project.project_id,
        user_id=user.user_id,
        name="Ony launch v2",
        description="Updated",
        product_context={"category": "care", "positioning": "health"},
        features=["daily check-in"],
        prices=["39000"],
        target_notes="families",
        alternatives=["home visit"],
    )
    assert updated is not None
    assert updated.name == "Ony launch v2"
    assert updated.product_context["positioning"] == "health"

    assert [item.project_id for item in store.list_projects(user.user_id)] == [project.project_id]
    archived = store.archive_project(project.project_id, user.user_id)
    assert archived is not None
    assert archived.archived_at is not None
    assert store.list_projects(user.user_id) == []
    assert store.list_projects(user.user_id, include_archived=True)[0].project_id == project.project_id


def test_project_run_association_and_ownership(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    owner = _user(store, "owner")
    other = _user(store, "other")
    project = store.create_project(user=owner, name="Project")
    run = store.create_run(_request(), run_id="run-project-1", user=owner)

    link = store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=owner.user_id,
        derived_from_run_id=None,
        run_label="Baseline creative test",
    )

    assert link.project_id == project.project_id
    assert link.run_id == run.run_id
    assert store.user_owns_run(owner.user_id, run.run_id) is True
    assert store.user_owns_run(other.user_id, run.run_id) is False
    assert store.get_project_for_run(run.run_id).project_id == project.project_id

    listed = store.list_project_runs(project.project_id, owner.user_id)
    assert [(item.run_id, run_record.run_id) for item, run_record in listed] == [(run.run_id, run.run_id)]
    assert store.list_project_runs(project.project_id, other.user_id) == []
    assert store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=owner.user_id,
        derived_from_run_id=None,
        run_label="Baseline creative test",
    ).run_id == run.run_id


def test_interview_thread_persists_ordered_exchanges(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    owner = _user(store, "owner")
    project = store.create_project(user=owner, name="Project")
    run = store.create_run(_request(), run_id="run-interview-1", user=owner)
    store.attach_project_run(project_id=project.project_id, run_id=run.run_id, user_id=owner.user_id)

    thread = store.get_or_create_interview_thread(
        user_id=owner.user_id,
        project_id=project.project_id,
        run_id=run.run_id,
        subject_uuid="persona-1",
        subject_label="김영희 · B안",
        subject_meta="62세 · 서울",
        context_quote="가격이 조금 부담스러워요.",
    )
    same_thread = store.get_or_create_interview_thread(
        user_id=owner.user_id,
        project_id=project.project_id,
        run_id=run.run_id,
        subject_uuid="persona-1",
        subject_label="김영희 · B안",
    )
    assert same_thread.thread_id == thread.thread_id
    assert same_thread.context_quote == "가격이 조금 부담스러워요."

    store.append_interview_exchange(
        user_id=owner.user_id,
        thread_id=thread.thread_id,
        question="왜 부담스러운가요?",
        answer="기존 서비스보다 비싸게 느껴집니다.",
        assistant_metadata={"provider": "fake"},
    )
    store.append_interview_exchange(
        user_id=owner.user_id,
        thread_id=thread.thread_id,
        question="어느 가격이면 괜찮나요?",
        answer="3만 원대라면 고려하겠습니다.",
    )

    messages = store.list_interview_messages(thread.thread_id)
    assert [message.role for message in messages] == ["user", "assistant", "user", "assistant"]
    assert [message.ordinal for message in messages] == [0, 1, 2, 3]
    assert messages[1].metadata == {"provider": "fake"}
    assert store.list_interview_threads(user_id=owner.user_id, run_id=run.run_id)[0].thread_id == thread.thread_id


def test_interactive_llm_action_limit_is_atomic_per_user_and_action(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    owner = _user(store, "owner")

    assert store.try_consume_interactive_llm_action(
        user_id=owner.user_id,
        action_type="project_followup",
        limit=2,
    ) == (True, 1)
    assert store.try_consume_interactive_llm_action(
        user_id=owner.user_id,
        action_type="project_followup",
        limit=2,
    ) == (True, 0)
    assert store.try_consume_interactive_llm_action(
        user_id=owner.user_id,
        action_type="project_followup",
        limit=2,
    ) == (False, 0)
    assert store.try_consume_interactive_llm_action(
        user_id=owner.user_id,
        action_type="interview_message",
        limit=2,
    ) == (True, 1)
