"""SQLite-backed persistence for run lifecycle state."""
from __future__ import annotations

import json
import sqlite3
from hashlib import sha256
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4

from src.api.schemas import RunCreateRequest
from src.config import SQLITE_PATH
from src.jobs.models import (
    AgentRunRecord,
    IntakeEventRecord,
    IntakeHistoryRecord,
    IntakeMessageRecord,
    IntakeSessionRecord,
    OrchestrationCheckpointRecord,
    RunEventRecord,
    RunEventType,
    RunRecord,
    RunResultRecord,
    RunStatusValue,
    UserRecord,
    UserUsageRecord,
)


def _utc_now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _json_loads(value: str | None, default: Any) -> Any:
    if value is None or value == "":
        return default
    return json.loads(value)


def _model_dump(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, dict):
        return value
    return dict(value)


class SQLiteRunStore:
    """Small SQLite store used by API and workers.

    The store opens short-lived connections per operation so workers never rely
    on process memory from the FastAPI process.
    """

    def __init__(self, path: Path | str = SQLITE_PATH) -> None:
        self.path = Path(path)

    def init_db(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(
                """
                PRAGMA journal_mode=WAL;

                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    simulation_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    input_json TEXT NOT NULL,
                    sample_size INTEGER NOT NULL,
                    total_count INTEGER NOT NULL,
                    done_count INTEGER NOT NULL DEFAULT 0,
                    target_filter_json TEXT NOT NULL,
                    seed INTEGER NOT NULL,
                    model_alias TEXT,
                    intake_context_json TEXT,
                    user_id TEXT,
                    user_email TEXT,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT,
                    error_json TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                );

                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    name TEXT,
                    provider TEXT NOT NULL,
                    plan TEXT NOT NULL DEFAULT 'free',
                    free_run_limit INTEGER NOT NULL DEFAULT 5,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_users_email
                    ON users (email);

                CREATE TABLE IF NOT EXISTS usage_ledger (
                    usage_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    run_id TEXT,
                    event_type TEXT NOT NULL,
                    delta INTEGER NOT NULL,
                    reason TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_created
                    ON usage_ledger (user_id, created_at);

                CREATE INDEX IF NOT EXISTS idx_usage_ledger_run_event
                    ON usage_ledger (run_id, event_type);

                CREATE TABLE IF NOT EXISTS run_events (
                    event_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_run_events_run_created
                    ON run_events (run_id, created_at);

                CREATE TABLE IF NOT EXISTS run_partial_results (
                    run_id TEXT NOT NULL,
                    persona_uuid TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (run_id, persona_uuid),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE TABLE IF NOT EXISTS run_results (
                    run_id TEXT PRIMARY KEY,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE TABLE IF NOT EXISTS agent_runs (
                    agent_run_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    safe_input_digest TEXT NOT NULL,
                    safe_input_json TEXT NOT NULL,
                    output_json TEXT NOT NULL,
                    scores_json TEXT NOT NULL,
                    provider TEXT,
                    provider_model TEXT,
                    trace_id TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_agent_runs_run_created
                    ON agent_runs (run_id, created_at);

                CREATE TABLE IF NOT EXISTS orchestration_checkpoints (
                    checkpoint_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    graph_name TEXT NOT NULL,
                    checkpoint_name TEXT NOT NULL,
                    state_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_orchestration_checkpoints_run_created
                    ON orchestration_checkpoints (run_id, created_at);

                CREATE TABLE IF NOT EXISTS intake_sessions (
                    session_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    title TEXT,
                    run_id TEXT,
                    user_id TEXT,
                    user_email TEXT,
                    snapshot_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE TABLE IF NOT EXISTS intake_messages (
                    message_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES intake_sessions (session_id)
                );

                CREATE INDEX IF NOT EXISTS idx_intake_messages_session_ordinal
                    ON intake_messages (session_id, ordinal);

                CREATE TABLE IF NOT EXISTS intake_events (
                    event_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES intake_sessions (session_id)
                );

                CREATE INDEX IF NOT EXISTS idx_intake_events_session_created
                    ON intake_events (session_id, created_at);
                """
            )
            self._ensure_column(conn, "intake_sessions", "title", "TEXT")
            self._ensure_column(conn, "intake_sessions", "run_id", "TEXT")
            self._ensure_column(conn, "intake_sessions", "user_id", "TEXT")
            self._ensure_column(conn, "intake_sessions", "user_email", "TEXT")
            self._ensure_column(conn, "runs", "intake_context_json", "TEXT")
            self._ensure_column(conn, "runs", "user_id", "TEXT")
            self._ensure_column(conn, "runs", "user_email", "TEXT")
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_intake_sessions_user_updated
                    ON intake_sessions (user_id, updated_at)
                """
            )
            self._backfill_intake_history_with_conn(conn)

    def create_run(
        self,
        request: RunCreateRequest,
        run_id: str | None = None,
        user: UserRecord | None = None,
    ) -> RunRecord:
        self.init_db()
        now = _utc_now()
        run_id = run_id or str(uuid4())
        input_data = _model_dump(request.input)
        target_filter = request.target_filter.model_dump(mode="json", exclude_none=True)
        intake_context = (
            request.intake_context.model_dump(mode="json", exclude_none=True)
            if request.intake_context
            else None
        )

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runs (
                    run_id, simulation_type, status, input_json, sample_size,
                    total_count, done_count, target_filter_json, seed, model_alias, intake_context_json,
                    user_id, user_email,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    request.simulation_type.value,
                    RunStatusValue.QUEUED.value,
                    _json_dumps(input_data),
                    request.sample_size,
                    request.sample_size,
                    0,
                    _json_dumps(target_filter),
                    request.seed,
                    request.model_alias,
                    _json_dumps(intake_context) if intake_context else None,
                    user.user_id if user else None,
                    user.email if user else None,
                    now,
                    now,
                ),
            )
            self._append_event_with_conn(
                conn,
                run_id=run_id,
                event_type=RunEventType.CREATED,
                payload={"status": RunStatusValue.QUEUED.value},
                created_at=now,
            )
            self._append_event_with_conn(
                conn,
                run_id=run_id,
                event_type=RunEventType.QUEUED,
                payload={"sample_size": request.sample_size},
                created_at=now,
            )

        record = self.get_run(run_id)
        if record is None:
            raise RuntimeError(f"Run was not persisted: {run_id}")
        return record

    def upsert_user_from_auth(
        self,
        user: dict[str, Any],
        *,
        free_run_limit: int = 5,
    ) -> UserRecord:
        self.init_db()
        now = _utc_now()
        user_id = _auth_user_id(user)
        email = str(user.get("email") or "").strip().lower()
        if not email:
            raise ValueError("Authenticated user must include an email.")
        provider = str(user.get("provider") or "unknown")
        name = user.get("name")
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT created_at, free_run_limit, plan FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            stored_limit = existing["free_run_limit"] if existing else free_run_limit
            plan = existing["plan"] if existing else "free"
            conn.execute(
                """
                INSERT INTO users (
                    user_id, email, name, provider, plan, free_run_limit, created_at, last_seen_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id)
                DO UPDATE SET email = excluded.email,
                              name = excluded.name,
                              provider = excluded.provider,
                              last_seen_at = excluded.last_seen_at
                """,
                (user_id, email, name, provider, plan, stored_limit, created_at, now),
            )
        record = self.get_user(user_id)
        if record is None:
            raise RuntimeError(f"User was not persisted: {user_id}")
        return record

    def get_user(self, user_id: str) -> UserRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_by_email(self, email: str) -> UserRecord | None:
        self.init_db()
        normalized_email = email.strip().lower()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM users
                WHERE email = ?
                ORDER BY last_seen_at DESC, rowid DESC
                LIMIT 1
                """,
                (normalized_email,),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_usage(
        self,
        user_id: str,
        *,
        quota_bypass: bool = False,
    ) -> UserUsageRecord:
        self.init_db()
        with self._connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            if user is None:
                raise KeyError(user_id)
            usage_row = conn.execute(
                """
                SELECT COALESCE(SUM(delta), 0) AS used_runs
                FROM usage_ledger
                WHERE user_id = ?
                    AND event_type IN ('run_completed', 'admin_adjustment')
                """,
                (user_id,),
            ).fetchone()
        used_runs = max(0, int(usage_row["used_runs"] if usage_row else 0))
        free_run_limit = int(user["free_run_limit"])
        remaining_runs = max(0, free_run_limit - used_runs)
        return UserUsageRecord(
            user_id=user["user_id"],
            email=user["email"],
            plan=user["plan"],
            free_run_limit=free_run_limit,
            used_runs=used_runs,
            remaining_runs=remaining_runs,
            can_create_run=quota_bypass or used_runs < free_run_limit,
            quota_bypass=quota_bypass,
        )

    def reserve_free_run(self, user_id: str, run_id: str, *, reason: str) -> None:
        self._append_usage_event(
            user_id=user_id,
            run_id=run_id,
            event_type="run_reserved",
            delta=1,
            reason=reason,
        )

    def adjust_free_runs(self, user_id: str, *, delta: int, reason: str) -> UserUsageRecord:
        if delta == 0:
            return self.get_user_usage(user_id)
        self._append_usage_event(
            user_id=user_id,
            run_id=None,
            event_type="admin_adjustment",
            delta=delta,
            reason=reason,
        )
        return self.get_user_usage(user_id)

    def reset_free_run_usage(self, user_id: str, *, reason: str) -> UserUsageRecord:
        usage = self.get_user_usage(user_id)
        if usage.used_runs <= 0:
            return usage
        return self.adjust_free_runs(user_id, delta=-usage.used_runs, reason=reason)

    def complete_free_run(self, user_id: str, run_id: str, *, reason: str) -> None:
        self.init_db()
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT 1 FROM usage_ledger
                WHERE user_id = ? AND run_id = ? AND event_type = 'run_completed'
                LIMIT 1
                """,
                (user_id, run_id),
            ).fetchone()
            if existing is not None:
                return
            self._append_usage_event_with_conn(
                conn,
                user_id=user_id,
                run_id=run_id,
                event_type="run_completed",
                delta=1,
                reason=reason,
                created_at=_utc_now(),
            )

    def try_reserve_free_run(
        self,
        user_id: str,
        run_id: str,
        *,
        free_run_limit: int,
        reason: str,
    ) -> bool:
        self.init_db()
        with self._connect() as conn:
            usage_row = conn.execute(
                """
                SELECT COALESCE(SUM(delta), 0) AS used_runs
                FROM usage_ledger
                WHERE user_id = ?
                    AND event_type IN ('run_completed', 'admin_adjustment')
                """,
                (user_id,),
            ).fetchone()
            used_runs = max(0, int(usage_row["used_runs"] if usage_row else 0))
            if used_runs >= free_run_limit:
                return False
            self._append_usage_event_with_conn(
                conn,
                user_id=user_id,
                run_id=run_id,
                event_type="run_reserved",
                delta=1,
                reason=reason,
                created_at=_utc_now(),
            )
            return True

    def refund_free_run(self, user_id: str, run_id: str, *, reason: str) -> None:
        self.init_db()
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT 1 FROM usage_ledger
                WHERE user_id = ? AND run_id = ? AND event_type = 'run_refunded'
                LIMIT 1
                """,
                (user_id, run_id),
            ).fetchone()
            if existing is not None:
                return
            self._append_usage_event_with_conn(
                conn,
                user_id=user_id,
                run_id=run_id,
                event_type="run_refunded",
                delta=-1,
                reason=reason,
                created_at=_utc_now(),
            )

    def list_runs_for_user(self, user_id: str, *, limit: int = 20) -> list[RunRecord]:
        self.init_db()
        safe_limit = max(1, min(limit, 200))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM runs
                WHERE user_id = ?
                ORDER BY created_at DESC, rowid DESC
                LIMIT ?
                """,
                (user_id, safe_limit),
            ).fetchall()
        return [self._row_to_run(row) for row in rows]

    def get_run(self, run_id: str) -> RunRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_run(row)

    def update_run_status(
        self,
        run_id: str,
        status: RunStatusValue,
        *,
        done_count: int | None = None,
        started_at: str | None = None,
        completed_at: str | None = None,
        error: dict[str, Any] | None = None,
    ) -> RunRecord:
        self.init_db()
        now = _utc_now()
        assignments = ["status = ?", "updated_at = ?"]
        values: list[Any] = [status.value, now]

        if done_count is not None:
            assignments.append("done_count = ?")
            values.append(done_count)
        if started_at is not None:
            assignments.append("started_at = COALESCE(started_at, ?)")
            values.append(started_at)
        if completed_at is not None:
            assignments.append("completed_at = ?")
            values.append(completed_at)
        if error is not None:
            assignments.append("error_json = ?")
            values.append(_json_dumps(error))

        values.append(run_id)

        with self._connect() as conn:
            cursor = conn.execute(
                f"UPDATE runs SET {', '.join(assignments)} WHERE run_id = ?",
                values,
            )
            if cursor.rowcount == 0:
                raise KeyError(run_id)

        record = self.get_run(run_id)
        if record is None:
            raise KeyError(run_id)
        return record

    def append_event(
        self,
        run_id: str,
        event_type: RunEventType,
        payload: dict[str, Any] | None = None,
    ) -> RunEventRecord:
        self.init_db()
        created_at = _utc_now()
        with self._connect() as conn:
            event = self._append_event_with_conn(
                conn,
                run_id=run_id,
                event_type=event_type,
                payload=payload or {},
                created_at=created_at,
            )
        return event

    def upsert_partial_result(
        self,
        run_id: str,
        persona_uuid: str,
        result: dict[str, Any],
    ) -> None:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO run_partial_results (run_id, persona_uuid, result_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(run_id, persona_uuid)
                DO UPDATE SET result_json = excluded.result_json, updated_at = excluded.updated_at
                """,
                (run_id, persona_uuid, _json_dumps(result), now),
            )
            conn.execute("UPDATE runs SET updated_at = ? WHERE run_id = ?", (now, run_id))

    def save_result(self, run_id: str, result: dict[str, Any]) -> RunResultRecord:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO run_results (run_id, result_json, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(run_id)
                DO UPDATE SET result_json = excluded.result_json, created_at = excluded.created_at
                """,
                (run_id, _json_dumps(result), now),
            )
            conn.execute("UPDATE runs SET updated_at = ? WHERE run_id = ?", (now, run_id))
        return RunResultRecord(run_id=run_id, result=result, created_at=now)

    def get_result(self, run_id: str) -> RunResultRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM run_results WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        return RunResultRecord(
            run_id=row["run_id"],
            result=_json_loads(row["result_json"], {}),
            created_at=row["created_at"],
        )

    def save_agent_run(
        self,
        *,
        run_id: str,
        agent_name: str,
        task_type: str,
        prompt_version: str,
        mode: str,
        safe_input: dict[str, Any],
        output: dict[str, Any],
        scores: dict[str, Any] | None = None,
        provider: str | None = None,
        provider_model: str | None = None,
        trace_id: str | None = None,
        agent_run_id: str | None = None,
    ) -> AgentRunRecord:
        self.init_db()
        created_at = _utc_now()
        agent_run_id = agent_run_id or str(uuid4())
        safe_input_digest = _json_digest(safe_input)
        score_values = scores or {}
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_runs (
                    agent_run_id, run_id, agent_name, task_type, prompt_version,
                    mode, safe_input_digest, safe_input_json, output_json, scores_json,
                    provider, provider_model, trace_id, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agent_run_id,
                    run_id,
                    agent_name,
                    task_type,
                    prompt_version,
                    mode,
                    safe_input_digest,
                    _json_dumps(safe_input),
                    _json_dumps(output),
                    _json_dumps(score_values),
                    provider,
                    provider_model,
                    trace_id,
                    created_at,
                ),
            )
        return AgentRunRecord(
            agent_run_id=agent_run_id,
            run_id=run_id,
            agent_name=agent_name,
            task_type=task_type,
            prompt_version=prompt_version,
            mode=mode,
            safe_input_digest=safe_input_digest,
            safe_input=safe_input,
            output=output,
            scores=score_values,
            provider=provider,
            provider_model=provider_model,
            trace_id=trace_id,
            created_at=created_at,
        )

    def list_agent_runs(self, run_id: str) -> list[AgentRunRecord]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM agent_runs
                WHERE run_id = ?
                ORDER BY created_at ASC, rowid ASC
                """,
                (run_id,),
            ).fetchall()
        return [self._row_to_agent_run(row) for row in rows]

    def save_orchestration_checkpoint(
        self,
        *,
        run_id: str,
        graph_name: str,
        checkpoint_name: str,
        state: dict[str, Any],
        checkpoint_id: str | None = None,
    ) -> OrchestrationCheckpointRecord:
        self.init_db()
        created_at = _utc_now()
        checkpoint_id = checkpoint_id or str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO orchestration_checkpoints (
                    checkpoint_id, run_id, graph_name, checkpoint_name, state_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    checkpoint_id,
                    run_id,
                    graph_name,
                    checkpoint_name,
                    _json_dumps(state),
                    created_at,
                ),
            )
        return OrchestrationCheckpointRecord(
            checkpoint_id=checkpoint_id,
            run_id=run_id,
            graph_name=graph_name,
            checkpoint_name=checkpoint_name,
            state=state,
            created_at=created_at,
        )

    def list_orchestration_checkpoints(
        self,
        run_id: str,
    ) -> list[OrchestrationCheckpointRecord]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM orchestration_checkpoints
                WHERE run_id = ?
                ORDER BY created_at ASC, rowid ASC
                """,
                (run_id,),
            ).fetchall()
        return [self._row_to_orchestration_checkpoint(row) for row in rows]

    def list_events(self, run_id: str) -> list[RunEventRecord]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM run_events
                WHERE run_id = ?
                ORDER BY created_at ASC, rowid ASC
                """,
                (run_id,),
            ).fetchall()
        return [
            RunEventRecord(
                event_id=row["event_id"],
                run_id=row["run_id"],
                event_type=RunEventType(row["event_type"]),
                payload=_json_loads(row["payload_json"], {}),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def list_events_after(self, run_id: str, after_event_id: str | None) -> list[RunEventRecord]:
        if after_event_id is None or after_event_id == "":
            return self.list_events(run_id)
        try:
            after_cursor = int(after_event_id)
        except ValueError as exc:
            raise ValueError("Event cursor must be a numeric event id.") from exc

        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT rowid, * FROM run_events
                WHERE run_id = ? AND rowid > ?
                ORDER BY rowid ASC
                """,
                (run_id, after_cursor),
            ).fetchall()
        return [self._row_to_event(row) for row in rows]

    def list_partial_results(self, run_id: str) -> list[dict[str, Any]]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT result_json FROM run_partial_results
                WHERE run_id = ?
                ORDER BY updated_at ASC
                """,
                (run_id,),
            ).fetchall()
        return [_json_loads(row["result_json"], {}) for row in rows]

    def mark_active_runs_interrupted(self, *, reason: str = "worker_startup_recovery") -> list[RunRecord]:
        self.init_db()
        now = _utc_now()
        error = {
            "code": "WORKER_INTERRUPTED",
            "message": "Run was interrupted before completion. Partial results may be available.",
            "details": {"reason": reason},
        }
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM runs
                WHERE status = ?
                """,
                (RunStatusValue.RUNNING.value,),
            ).fetchall()
            for row in rows:
                conn.execute(
                    """
                    UPDATE runs
                    SET status = ?, updated_at = ?, completed_at = ?, error_json = ?
                    WHERE run_id = ?
                    """,
                    (
                        RunStatusValue.INTERRUPTED.value,
                        now,
                        now,
                        _json_dumps(error),
                        row["run_id"],
                    ),
                )
                self._append_event_with_conn(
                    conn,
                    run_id=row["run_id"],
                    event_type=RunEventType.INTERRUPTED,
                    payload=error,
                    created_at=now,
                )
        return [run for row in rows if (run := self.get_run(row["run_id"])) is not None]

    def has_result(self, run_id: str) -> bool:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute("SELECT 1 FROM run_results WHERE run_id = ?", (run_id,)).fetchone()
        return row is not None

    def check(self) -> dict[str, Any]:
        self.init_db()
        with self._connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"ok": True, "path": str(self.path)}

    def save_intake_session(
        self,
        *,
        session_id: str,
        status: str,
        snapshot: dict[str, Any],
        event_type: str = "session_saved",
        user: UserRecord | None = None,
    ) -> IntakeSessionRecord:
        self.init_db()
        now = _utc_now()
        title = _intake_title(snapshot)
        run_id = _intake_run_id(snapshot)
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT created_at, user_id FROM intake_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if existing and user and existing["user_id"] and existing["user_id"] != user.user_id:
                raise PermissionError(f"Intake session belongs to a different user: {session_id}")
            created_at = existing["created_at"] if existing else now
            conn.execute(
                """
                INSERT INTO intake_sessions (
                    session_id, status, title, run_id, user_id, user_email,
                    snapshot_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id)
                DO UPDATE SET status = excluded.status,
                              title = excluded.title,
                              run_id = COALESCE(excluded.run_id, intake_sessions.run_id),
                              user_id = COALESCE(intake_sessions.user_id, excluded.user_id),
                              user_email = COALESCE(intake_sessions.user_email, excluded.user_email),
                              snapshot_json = excluded.snapshot_json,
                              updated_at = excluded.updated_at
                """,
                (
                    session_id,
                    status,
                    title,
                    run_id,
                    user.user_id if user else None,
                    user.email if user else None,
                    _json_dumps(snapshot),
                    created_at,
                    now,
                ),
            )
            self._replace_intake_messages_with_conn(
                conn,
                session_id=session_id,
                messages=_intake_messages(snapshot),
                created_at=now,
            )
            self._append_intake_event_with_conn(
                conn,
                session_id=session_id,
                event_type=event_type,
                payload={"status": status},
                created_at=now,
            )
        record = self.get_intake_session(session_id, user_id=user.user_id if user else None)
        if record is None:
            raise RuntimeError(f"Intake session was not persisted: {session_id}")
        return record

    def attach_intake_run(
        self,
        *,
        session_id: str,
        run_id: str,
        user_id: str | None = None,
    ) -> IntakeSessionRecord:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT snapshot_json, user_id FROM intake_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None:
                raise KeyError(session_id)
            if user_id is not None and row["user_id"] != user_id:
                raise KeyError(session_id)
            snapshot = _json_loads(row["snapshot_json"], {})
            if isinstance(snapshot, dict):
                snapshot = {**snapshot, "run_id": run_id}
            conn.execute(
                """
                UPDATE intake_sessions
                SET run_id = ?, snapshot_json = ?, updated_at = ?
                WHERE session_id = ?
                """,
                (run_id, _json_dumps(snapshot), now, session_id),
            )
            self._append_intake_event_with_conn(
                conn,
                session_id=session_id,
                event_type="run_linked",
                payload={"run_id": run_id},
                created_at=now,
            )
        record = self.get_intake_session(session_id, user_id=user_id)
        if record is None:
            raise KeyError(session_id)
        return record

    def get_intake_session(
        self,
        session_id: str,
        *,
        user_id: str | None = None,
    ) -> IntakeSessionRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM intake_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        if user_id is not None and row["user_id"] != user_id:
            return None
        return IntakeSessionRecord(
            session_id=row["session_id"],
            status=row["status"],
            snapshot=_json_loads(row["snapshot_json"], {}),
            title=row["title"],
            run_id=row["run_id"],
            user_id=row["user_id"],
            user_email=row["user_email"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def list_intake_sessions(
        self,
        *,
        limit: int = 20,
        user_id: str | None = None,
    ) -> list[IntakeSessionRecord]:
        self.init_db()
        safe_limit = max(1, min(limit, 100))
        where_clause = "WHERE user_id = ?" if user_id is not None else ""
        values: list[Any] = [user_id] if user_id is not None else []
        values.append(safe_limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM intake_sessions
                {where_clause}
                ORDER BY updated_at DESC, rowid DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return [
            IntakeSessionRecord(
                session_id=row["session_id"],
                status=row["status"],
                snapshot=_json_loads(row["snapshot_json"], {}),
                title=row["title"],
                run_id=row["run_id"],
                user_id=row["user_id"],
                user_email=row["user_email"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    def list_intake_history(
        self,
        *,
        limit: int = 20,
        user_id: str | None = None,
    ) -> list[IntakeHistoryRecord]:
        self.init_db()
        safe_limit = max(1, min(limit, 100))
        where_clause = "WHERE user_id = ?" if user_id is not None else ""
        values: list[Any] = [user_id] if user_id is not None else []
        values.append(safe_limit)
        with self._connect() as conn:
            session_rows = conn.execute(
                f"""
                SELECT session_id, status, title, run_id, created_at, updated_at
                FROM intake_sessions
                {where_clause}
                ORDER BY updated_at DESC, rowid DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
            session_ids = [row["session_id"] for row in session_rows]
            messages_by_session: dict[str, list[IntakeMessageRecord]] = {session_id: [] for session_id in session_ids}
            if session_ids:
                placeholders = ",".join("?" for _ in session_ids)
                message_rows = conn.execute(
                    f"""
                    SELECT * FROM intake_messages
                    WHERE session_id IN ({placeholders})
                    ORDER BY session_id ASC, ordinal ASC, rowid ASC
                    """,
                    session_ids,
                ).fetchall()
                for row in message_rows:
                    messages_by_session[row["session_id"]].append(self._row_to_intake_message(row))
        return [
            IntakeHistoryRecord(
                session_id=row["session_id"],
                status=row["status"],
                title=row["title"] or "새 intake 대화",
                run_id=row["run_id"],
                messages=messages_by_session.get(row["session_id"], []),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in session_rows
        ]

    def list_intake_events(self, session_id: str) -> list[IntakeEventRecord]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM intake_events
                WHERE session_id = ?
                ORDER BY created_at ASC, rowid ASC
                """,
                (session_id,),
            ).fetchall()
        return [
            IntakeEventRecord(
                event_id=row["event_id"],
                session_id=row["session_id"],
                event_type=row["event_type"],
                payload=_json_loads(row["payload_json"], {}),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        else:
            conn.commit()
        finally:
            conn.close()

    def _append_event_with_conn(
        self,
        conn: sqlite3.Connection,
        *,
        run_id: str,
        event_type: RunEventType,
        payload: dict[str, Any],
        created_at: str,
    ) -> RunEventRecord:
        conn.execute(
            """
            INSERT INTO run_events (event_id, run_id, event_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid4()), run_id, event_type.value, _json_dumps(payload), created_at),
        )
        row_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        event_id = str(row_id)
        conn.execute("UPDATE run_events SET event_id = ? WHERE rowid = ?", (event_id, row_id))
        return RunEventRecord(
            event_id=event_id,
            run_id=run_id,
            event_type=event_type,
            payload=payload,
            created_at=created_at,
        )

    def _append_intake_event_with_conn(
        self,
        conn: sqlite3.Connection,
        *,
        session_id: str,
        event_type: str,
        payload: dict[str, Any],
        created_at: str,
    ) -> IntakeEventRecord:
        conn.execute(
            """
            INSERT INTO intake_events (event_id, session_id, event_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid4()), session_id, event_type, _json_dumps(payload), created_at),
        )
        row_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        event_id = str(row_id)
        conn.execute("UPDATE intake_events SET event_id = ? WHERE rowid = ?", (event_id, row_id))
        return IntakeEventRecord(
            event_id=event_id,
            session_id=session_id,
            event_type=event_type,
            payload=payload,
            created_at=created_at,
        )

    def _append_usage_event(
        self,
        *,
        user_id: str,
        run_id: str | None,
        event_type: str,
        delta: int,
        reason: str,
    ) -> None:
        self.init_db()
        with self._connect() as conn:
            self._append_usage_event_with_conn(
                conn,
                user_id=user_id,
                run_id=run_id,
                event_type=event_type,
                delta=delta,
                reason=reason,
                created_at=_utc_now(),
            )

    def _append_usage_event_with_conn(
        self,
        conn: sqlite3.Connection,
        *,
        user_id: str,
        run_id: str | None,
        event_type: str,
        delta: int,
        reason: str,
        created_at: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO usage_ledger (
                usage_id, user_id, run_id, event_type, delta, reason, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid4()), user_id, run_id, event_type, delta, reason, created_at),
        )

    def _replace_intake_messages_with_conn(
        self,
        conn: sqlite3.Connection,
        *,
        session_id: str,
        messages: list[dict[str, str]],
        created_at: str,
    ) -> None:
        conn.execute("DELETE FROM intake_messages WHERE session_id = ?", (session_id,))
        for ordinal, message in enumerate(messages):
            conn.execute(
                """
                INSERT INTO intake_messages (message_id, session_id, role, content, ordinal, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    session_id,
                    message["role"],
                    message["content"],
                    ordinal,
                    created_at,
                ),
            )

    def _backfill_intake_history_with_conn(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            """
            SELECT session_id, title, run_id, snapshot_json
            FROM intake_sessions
            ORDER BY rowid ASC
            """
        ).fetchall()
        for row in rows:
            snapshot = _json_loads(row["snapshot_json"], {})
            messages = _intake_messages(snapshot)
            if messages:
                existing_messages = conn.execute(
                    "SELECT 1 FROM intake_messages WHERE session_id = ? LIMIT 1",
                    (row["session_id"],),
                ).fetchone()
                if existing_messages is None:
                    self._replace_intake_messages_with_conn(
                        conn,
                        session_id=row["session_id"],
                        messages=messages,
                        created_at=_utc_now(),
                    )
            title = row["title"] or _intake_title(snapshot)
            run_id = row["run_id"] or _intake_run_id(snapshot)
            conn.execute(
                """
                UPDATE intake_sessions
                SET title = COALESCE(title, ?),
                    run_id = COALESCE(run_id, ?)
                WHERE session_id = ?
                """,
                (title, run_id, row["session_id"]),
            )

    def _row_to_run(self, row: sqlite3.Row) -> RunRecord:
        return RunRecord(
            run_id=row["run_id"],
            simulation_type=row["simulation_type"],
            input=_json_loads(row["input_json"], {}),
            sample_size=row["sample_size"],
            total_count=row["total_count"],
            target_filter=_json_loads(row["target_filter_json"], {}),
            seed=row["seed"],
            status=RunStatusValue(row["status"]),
            done_count=row["done_count"],
            model_alias=row["model_alias"],
            intake_context=_json_loads(row["intake_context_json"], None),
            user_id=row["user_id"],
            user_email=row["user_email"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
            error=_json_loads(row["error_json"], None),
        )

    def _row_to_user(self, row: sqlite3.Row) -> UserRecord:
        return UserRecord(
            user_id=row["user_id"],
            email=row["email"],
            name=row["name"],
            provider=row["provider"],
            plan=row["plan"],
            free_run_limit=row["free_run_limit"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
        )

    def _row_to_event(self, row: sqlite3.Row) -> RunEventRecord:
        return RunEventRecord(
            event_id=row["event_id"],
            run_id=row["run_id"],
            event_type=RunEventType(row["event_type"]),
            payload=_json_loads(row["payload_json"], {}),
            created_at=row["created_at"],
        )

    def _row_to_agent_run(self, row: sqlite3.Row) -> AgentRunRecord:
        return AgentRunRecord(
            agent_run_id=row["agent_run_id"],
            run_id=row["run_id"],
            agent_name=row["agent_name"],
            task_type=row["task_type"],
            prompt_version=row["prompt_version"],
            mode=row["mode"],
            safe_input_digest=row["safe_input_digest"],
            safe_input=_json_loads(row["safe_input_json"], {}),
            output=_json_loads(row["output_json"], {}),
            scores=_json_loads(row["scores_json"], {}),
            provider=row["provider"],
            provider_model=row["provider_model"],
            trace_id=row["trace_id"],
            created_at=row["created_at"],
        )

    def _row_to_orchestration_checkpoint(
        self,
        row: sqlite3.Row,
    ) -> OrchestrationCheckpointRecord:
        return OrchestrationCheckpointRecord(
            checkpoint_id=row["checkpoint_id"],
            run_id=row["run_id"],
            graph_name=row["graph_name"],
            checkpoint_name=row["checkpoint_name"],
            state=_json_loads(row["state_json"], {}),
            created_at=row["created_at"],
        )

    def _row_to_intake_message(self, row: sqlite3.Row) -> IntakeMessageRecord:
        return IntakeMessageRecord(
            message_id=row["message_id"],
            session_id=row["session_id"],
            role=row["role"],
            content=row["content"],
            ordinal=row["ordinal"],
            created_at=row["created_at"],
        )

    def _ensure_column(
        self,
        conn: sqlite3.Connection,
        table: str,
        column: str,
        definition: str,
    ) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _intake_messages(snapshot: dict[str, Any]) -> list[dict[str, str]]:
    raw_messages = snapshot.get("messages") if isinstance(snapshot, dict) else None
    if not isinstance(raw_messages, list):
        return []
    messages: list[dict[str, str]] = []
    for item in raw_messages:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role not in {"assistant", "user"} or not isinstance(content, str) or not content.strip():
            continue
        messages.append({"role": role, "content": content.strip()})
    return messages


def _intake_title(snapshot: dict[str, Any]) -> str:
    messages = _intake_messages(snapshot)
    first_user = next((message["content"] for message in messages if message["role"] == "user"), "")
    if first_user:
        return first_user[:120]
    slots = snapshot.get("slots") if isinstance(snapshot, dict) else None
    if isinstance(slots, dict):
        product = slots.get("product_description")
        if isinstance(product, dict) and isinstance(product.get("value"), str):
            return product["value"][:120]
    return "새 intake 대화"


def _intake_run_id(snapshot: dict[str, Any]) -> str | None:
    if not isinstance(snapshot, dict):
        return None
    run_id = snapshot.get("run_id") or snapshot.get("runId")
    return run_id if isinstance(run_id, str) and run_id.strip() else None


def _auth_user_id(user: dict[str, Any]) -> str:
    provider = str(user.get("provider") or "unknown").strip().lower() or "unknown"
    email = str(user.get("email") or "").strip().lower()
    external_id = str(user.get("id") or "").strip()
    if provider in {"test", "local_dev"} and email:
        return f"{provider}:{email}"
    if external_id:
        return f"{provider}:{external_id}"
    if email:
        return f"{provider}:{email}"
    raise ValueError("Authenticated user must include an id or email.")


def _json_digest(value: dict[str, Any]) -> str:
    return sha256(_json_dumps(value).encode("utf-8")).hexdigest()
