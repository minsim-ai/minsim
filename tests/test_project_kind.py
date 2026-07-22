"""프로젝트 갈래(poll/venture) — 마이그레이션 안전성 포함.

여론조사를 `/dgist` 별도 화면이 아니라 프로젝트 생성 갈래로 통합한다.
기존 프로젝트 행은 자동으로 venture가 되어 동작이 바뀌지 않아야 한다.
"""
import pytest

from src.api.schemas import ProjectCreateRequest, ProjectKind
from src.jobs.store import SQLiteRunStore


@pytest.fixture
def store(tmp_path):
    instance = SQLiteRunStore(path=tmp_path / "kind.sqlite3")
    instance.init_db()
    return instance


@pytest.fixture
def user(store):
    return store.upsert_user_from_auth(
        {"id": "u1", "email": "kind@test.local", "provider": "test"}
    )


def test_default_kind_is_venture(store, user):
    project = store.create_project(user=user, name="기존 방식")
    assert project.kind == "venture"


def test_poll_kind_round_trips(store, user):
    created = store.create_project(user=user, name="여론조사", kind="poll")
    assert created.kind == "poll"
    assert store.get_project(created.project_id).kind == "poll"


def test_kind_is_normalized(store, user):
    project = store.create_project(user=user, name="대문자", kind="POLL")
    assert project.kind == "poll"


def test_rows_written_before_the_column_existed_read_as_venture(store, user):
    """마이그레이션 안전성 — kind 없이 INSERT된 행도 venture로 읽혀야 한다."""
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO projects (
                project_id, user_id, name, description, product_context_json,
                features_json, prices_json, target_notes, alternatives_json,
                created_at, updated_at, archived_at
            )
            VALUES ('legacy', ?, '옛 프로젝트', '', '{}', '[]', '[]', '', '[]',
                    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL)
            """,
            (user.user_id,),
        )
    assert store.get_project("legacy").kind == "venture"


def test_request_schema_defaults_to_venture():
    assert ProjectCreateRequest(name="x").kind is ProjectKind.VENTURE


def test_request_schema_rejects_unknown_kind():
    with pytest.raises(ValueError):
        ProjectCreateRequest(name="x", kind="poll_or_something")


def test_update_preserves_kind(store, user):
    created = store.create_project(user=user, name="여론조사", kind="poll")
    updated = store.update_project(
        created.project_id, user_id=user.user_id, name="이름만 변경", kind="poll"
    )
    assert updated.kind == "poll"
