"""SQLite-backed persistence for run lifecycle state."""
from __future__ import annotations

import base64
import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import uuid4

from src.api.schemas import RunCreateRequest
from src.config import SQLITE_PATH
from src.jobs.models import (
    AgentRunRecord,
    InterviewMessageRecord,
    InterviewThreadRecord,
    IntakeEventRecord,
    IntakeHistoryRecord,
    IntakeMessageRecord,
    IntakeSessionRecord,
    OrchestrationCheckpointRecord,
    ProjectRecord,
    ProjectRunRecord,
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
                    free_run_limit INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_users_email
                    ON users (email);

                CREATE TABLE IF NOT EXISTS projects (
                    project_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    product_context_json TEXT NOT NULL DEFAULT '{}',
                    features_json TEXT NOT NULL DEFAULT '[]',
                    prices_json TEXT NOT NULL DEFAULT '[]',
                    target_notes TEXT NOT NULL DEFAULT '',
                    alternatives_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    archived_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                );

                CREATE INDEX IF NOT EXISTS idx_projects_user_updated
                    ON projects (user_id, updated_at);

                CREATE TABLE IF NOT EXISTS project_runs (
                    project_id TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    derived_from_run_id TEXT,
                    run_label TEXT,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (project_id, run_id),
                    FOREIGN KEY (project_id) REFERENCES projects (project_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_project_runs_project_created
                    ON project_runs (project_id, created_at);

                CREATE INDEX IF NOT EXISTS idx_project_runs_run
                    ON project_runs (run_id);

                CREATE TABLE IF NOT EXISTS interview_threads (
                    thread_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    subject_uuid TEXT NOT NULL,
                    subject_label TEXT NOT NULL DEFAULT '',
                    subject_meta TEXT NOT NULL DEFAULT '',
                    context_quote TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE (user_id, run_id, subject_uuid),
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (project_id) REFERENCES projects (project_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_interview_threads_run_updated
                    ON interview_threads (run_id, updated_at);

                CREATE TABLE IF NOT EXISTS interview_messages (
                    message_id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    UNIQUE (thread_id, ordinal),
                    FOREIGN KEY (thread_id) REFERENCES interview_threads (thread_id)
                );

                CREATE INDEX IF NOT EXISTS idx_interview_messages_thread_ordinal
                    ON interview_messages (thread_id, ordinal);

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

                CREATE TABLE IF NOT EXISTS interactive_llm_usage (
                    action_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                );

                CREATE INDEX IF NOT EXISTS idx_interactive_llm_usage_user_action_created
                    ON interactive_llm_usage (user_id, action_type, created_at);

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

                CREATE TABLE IF NOT EXISTS analytics_events (
                    event_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    user_email TEXT,
                    session_id TEXT,
                    run_id TEXT,
                    event_name TEXT NOT NULL,
                    page TEXT,
                    simulation_type TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
                    ON analytics_events (event_name, created_at);

                CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
                    ON analytics_events (user_id, created_at);

                CREATE TABLE IF NOT EXISTS user_feedback (
                    feedback_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    user_email TEXT,
                    run_id TEXT NOT NULL,
                    intake_session_id TEXT,
                    usefulness_score INTEGER,
                    trust_score INTEGER,
                    actionability_score INTEGER,
                    result_expectation TEXT,
                    free_text TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_user_feedback_run_created
                    ON user_feedback (run_id, created_at);

                CREATE TABLE IF NOT EXISTS result_followups (
                    followup_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    user_email TEXT,
                    run_id TEXT NOT NULL,
                    intended_action TEXT,
                    decision_confidence_before INTEGER,
                    decision_confidence_after INTEGER,
                    shared_with_team INTEGER NOT NULL DEFAULT 0,
                    exported_report INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (run_id) REFERENCES runs (run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_result_followups_run_created
                    ON result_followups (run_id, created_at);

                CREATE TABLE IF NOT EXISTS admin_audit_events (
                    event_id TEXT PRIMARY KEY,
                    admin_user_id TEXT,
                    admin_email TEXT,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (admin_user_id) REFERENCES users (user_id)
                );

                CREATE INDEX IF NOT EXISTS idx_admin_audit_events_admin_created
                    ON admin_audit_events (admin_user_id, created_at);

                CREATE TABLE IF NOT EXISTS oauth_clients (
                    client_id TEXT PRIMARY KEY,
                    client_name TEXT NOT NULL,
                    redirect_uris_json TEXT NOT NULL,
                    grant_types_json TEXT NOT NULL,
                    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
                    is_dynamic INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS oauth_grants (
                    grant_id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    client_name TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT,
                    revoked_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (client_id) REFERENCES oauth_clients (client_id)
                );

                CREATE INDEX IF NOT EXISTS idx_oauth_grants_user_created
                    ON oauth_grants (user_id, created_at);

                CREATE TABLE IF NOT EXISTS oauth_auth_codes (
                    code_hash TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    grant_id TEXT NOT NULL,
                    redirect_uri TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    code_challenge TEXT NOT NULL,
                    code_challenge_method TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used_at TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (client_id) REFERENCES oauth_clients (client_id),
                    FOREIGN KEY (grant_id) REFERENCES oauth_grants (grant_id)
                );

                CREATE TABLE IF NOT EXISTS oauth_tokens (
                    token_id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    token_type TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    grant_id TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked_at TEXT,
                    parent_token_id TEXT,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (user_id),
                    FOREIGN KEY (client_id) REFERENCES oauth_clients (client_id),
                    FOREIGN KEY (grant_id) REFERENCES oauth_grants (grant_id)
                );

                CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant
                    ON oauth_tokens (grant_id, token_type);
                """
            )
            self._ensure_column(conn, "intake_sessions", "title", "TEXT")
            self._ensure_column(conn, "intake_sessions", "run_id", "TEXT")
            self._ensure_column(conn, "intake_sessions", "user_id", "TEXT")
            self._ensure_column(conn, "intake_sessions", "user_email", "TEXT")
            self._ensure_column(conn, "runs", "intake_context_json", "TEXT")
            self._ensure_column(conn, "runs", "user_id", "TEXT")
            self._ensure_column(conn, "runs", "user_email", "TEXT")
            self._ensure_column(conn, "runs", "token_usage_json", "TEXT")
            self._ensure_column(conn, "runs", "persona_pool", "TEXT")
            self._ensure_column(conn, "projects", "kind", "TEXT NOT NULL DEFAULT 'venture'")
            self._ensure_column(conn, "runs", "country_id", "TEXT NOT NULL DEFAULT 'kr'")
            self._ensure_column(conn, "users", "onboarding_completed_at", "TEXT")
            self._ensure_column(conn, "users", "referral_source", "TEXT")
            self._ensure_column(conn, "users", "life_stage", "TEXT")
            self._ensure_column(conn, "users", "occupation", "TEXT")
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_intake_sessions_user_updated
                    ON intake_sessions (user_id, updated_at)
                """
            )
            self._backfill_intake_history_with_conn(conn)

    def record_analytics_event(
        self,
        *,
        event_name: str,
        user: UserRecord | None = None,
        session_id: str | None = None,
        run_id: str | None = None,
        page: str | None = None,
        simulation_type: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.init_db()
        now = _utc_now()
        event_id = str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO analytics_events (
                    event_id, user_id, user_email, session_id, run_id, event_name,
                    page, simulation_type, payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    user.user_id if user else None,
                    user.email if user else None,
                    session_id,
                    run_id,
                    event_name,
                    page,
                    simulation_type,
                    _json_dumps(payload or {}),
                    now,
                ),
            )
        return {
            "event_id": event_id,
            "event_name": event_name,
            "created_at": now,
        }

    def save_user_feedback(
        self,
        *,
        run_id: str,
        user: UserRecord | None = None,
        intake_session_id: str | None = None,
        usefulness_score: int | None = None,
        trust_score: int | None = None,
        actionability_score: int | None = None,
        result_expectation: str | None = None,
        free_text: str | None = None,
        intended_action: str | None = None,
        decision_confidence_before: int | None = None,
        decision_confidence_after: int | None = None,
        shared_with_team: bool = False,
        exported_report: bool = False,
    ) -> dict[str, Any]:
        self.init_db()
        now = _utc_now()
        feedback_id = str(uuid4())
        followup_id = str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO user_feedback (
                    feedback_id, user_id, user_email, run_id, intake_session_id,
                    usefulness_score, trust_score, actionability_score,
                    result_expectation, free_text, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    feedback_id,
                    user.user_id if user else None,
                    user.email if user else None,
                    run_id,
                    intake_session_id,
                    usefulness_score,
                    trust_score,
                    actionability_score,
                    result_expectation,
                    free_text,
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO result_followups (
                    followup_id, user_id, user_email, run_id, intended_action,
                    decision_confidence_before, decision_confidence_after,
                    shared_with_team, exported_report, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    followup_id,
                    user.user_id if user else None,
                    user.email if user else None,
                    run_id,
                    intended_action,
                    decision_confidence_before,
                    decision_confidence_after,
                    int(shared_with_team),
                    int(exported_report),
                    now,
                ),
            )
        return {
            "feedback_id": feedback_id,
            "followup_id": followup_id,
            "run_id": run_id,
            "created_at": now,
        }

    def append_admin_audit_event(
        self,
        *,
        admin: UserRecord | None,
        action: str,
        target_type: str | None = None,
        target_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.init_db()
        now = _utc_now()
        event_id = str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO admin_audit_events (
                    event_id, admin_user_id, admin_email, action, target_type,
                    target_id, payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    admin.user_id if admin else None,
                    admin.email if admin else None,
                    action,
                    target_type,
                    target_id,
                    _json_dumps(payload or {}),
                    now,
                ),
            )
        return {"event_id": event_id, "created_at": now}

    def admin_overview(self) -> dict[str, Any]:
        self.init_db()
        with self._connect() as conn:
            user_count = conn.execute("SELECT COUNT(*) AS value FROM users").fetchone()["value"]
            run_count = conn.execute("SELECT COUNT(*) AS value FROM runs").fetchone()["value"]
            completed_runs = conn.execute("SELECT COUNT(*) AS value FROM runs WHERE status = 'completed'").fetchone()["value"]
            failed_runs = conn.execute("SELECT COUNT(*) AS value FROM runs WHERE status = 'failed'").fetchone()["value"]
            intake_count = conn.execute("SELECT COUNT(*) AS value FROM intake_sessions").fetchone()["value"]
            feedback_count = conn.execute("SELECT COUNT(*) AS value FROM user_feedback").fetchone()["value"]
            event_count = conn.execute("SELECT COUNT(*) AS value FROM analytics_events").fetchone()["value"]
            by_simulation = [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT simulation_type, COUNT(*) AS count
                    FROM runs
                    GROUP BY simulation_type
                    ORDER BY count DESC
                    """
                ).fetchall()
            ]
            recent_events = [
                self._row_to_json_dict(row, ("payload_json",))
                for row in conn.execute(
                    """
                    SELECT event_id, event_name, user_email, session_id, run_id, page,
                           simulation_type, payload_json, created_at
                    FROM analytics_events
                    ORDER BY created_at DESC
                    LIMIT 20
                    """
                ).fetchall()
            ]
        return {
            "users": user_count,
            "runs": run_count,
            "completed_runs": completed_runs,
            "failed_runs": failed_runs,
            "intake_sessions": intake_count,
            "feedback": feedback_count,
            "analytics_events": event_count,
            "by_simulation": by_simulation,
            "recent_events": recent_events,
        }

    def admin_funnel(self) -> dict[str, Any]:
        self.init_db()
        steps = [
            ("app_viewed", ("page_view",)),
            ("intake_started", ("intake_session_saved", "intake_advanced")),
            ("run_created", ("run_created",)),
            ("result_viewed", ("result_viewed",)),
            ("export_clicked", ("export_clicked",)),
            ("feedback_submitted", ("feedback_submitted",)),
        ]
        with self._connect() as conn:
            funnel_steps: list[dict[str, Any]] = []
            previous_count: int | None = None
            for step_name, event_names in steps:
                placeholders = ",".join("?" for _ in event_names)
                row = conn.execute(
                    f"""
                    SELECT
                        COUNT(*) AS events,
                        COUNT(DISTINCT COALESCE(user_id, user_email, session_id, run_id, event_id)) AS actors
                    FROM analytics_events
                    WHERE event_name IN ({placeholders})
                    """,
                    event_names,
                ).fetchone()
                count = int(row["actors"] if row else 0)
                conversion = None
                if previous_count is not None:
                    conversion = round((count / previous_count) * 100, 1) if previous_count > 0 else 0.0
                funnel_steps.append(
                    {
                        "step": step_name,
                        "actors": count,
                        "events": int(row["events"] if row else 0),
                        "conversion_from_previous": conversion,
                    }
                )
                previous_count = count

            by_simulation = [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT
                        COALESCE(simulation_type, 'unknown') AS simulation_type,
                        SUM(CASE WHEN event_name = 'run_created' THEN 1 ELSE 0 END) AS run_created,
                        SUM(CASE WHEN event_name = 'result_viewed' THEN 1 ELSE 0 END) AS result_viewed,
                        SUM(CASE WHEN event_name = 'feedback_submitted' THEN 1 ELSE 0 END) AS feedback_submitted,
                        SUM(CASE WHEN event_name = 'export_clicked' THEN 1 ELSE 0 END) AS export_clicked
                    FROM analytics_events
                    GROUP BY COALESCE(simulation_type, 'unknown')
                    ORDER BY run_created DESC, result_viewed DESC
                    LIMIT 12
                    """
                ).fetchall()
            ]
        return {"steps": funnel_steps, "by_simulation": by_simulation}

    def admin_accounts(self, *, limit: int = 50) -> list[dict[str, Any]]:
        self.init_db()
        safe_limit = max(1, min(limit, 200))
        with self._connect() as conn:
            return [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT
                        CASE
                            WHEN instr(u.email, '@') > 0 THEN lower(substr(u.email, instr(u.email, '@') + 1))
                            ELSE 'unknown'
                        END AS account_domain,
                        COUNT(DISTINCT u.user_id) AS users,
                        COUNT(DISTINCT r.run_id) AS runs,
                        SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
                        COUNT(DISTINCT f.feedback_id) AS feedback,
                        MAX(u.last_seen_at) AS last_seen_at,
                        SUM(CASE WHEN u.plan != 'free' THEN 1 ELSE 0 END) AS paid_users,
                        SUM(CASE WHEN u.free_run_limit <= COALESCE(usage.used_runs, 0) THEN 1 ELSE 0 END) AS quota_exhausted_users
                    FROM users u
                    LEFT JOIN runs r ON r.user_id = u.user_id
                    LEFT JOIN user_feedback f ON f.user_id = u.user_id
                    LEFT JOIN (
                        SELECT user_id, COALESCE(SUM(delta), 0) AS used_runs
                        FROM usage_ledger
                        WHERE event_type IN ('run_completed', 'admin_adjustment')
                        GROUP BY user_id
                    ) usage ON usage.user_id = u.user_id
                    GROUP BY account_domain
                    ORDER BY runs DESC, users DESC, last_seen_at DESC
                    LIMIT ?
                    """,
                    (safe_limit,),
                ).fetchall()
            ]

    def admin_policy(self, *, retention_days: int) -> dict[str, Any]:
        self.init_db()
        cutoff = _days_ago(retention_days)
        with self._connect() as conn:
            old_runs = conn.execute(
                """
                SELECT COUNT(*) AS value
                FROM runs
                WHERE created_at < ?
                    AND status IN ('completed', 'failed', 'canceled', 'interrupted')
                """,
                (cutoff,),
            ).fetchone()["value"]
            old_events = conn.execute(
                """
                SELECT COUNT(*) AS value
                FROM analytics_events
                WHERE created_at < ?
                """,
                (cutoff,),
            ).fetchone()["value"]
            audit_events = conn.execute("SELECT COUNT(*) AS value FROM admin_audit_events").fetchone()["value"]
        return {
            "schema_version": "admin-data-policy/v1",
            "retention_days": retention_days,
            "cutoff": cutoff,
            "default_masking": True,
            "raw_persona_export": False,
            "human_review_required_for_exports": True,
            "deletable": {
                "runs": int(old_runs),
                "analytics_events": int(old_events),
                "admin_audit_events": int(audit_events),
            },
        }

    def admin_users(self, *, limit: int = 50) -> list[dict[str, Any]]:
        self.init_db()
        safe_limit = max(1, min(limit, 200))
        with self._connect() as conn:
            return [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT
                        u.user_id,
                        u.email,
                        u.name,
                        u.provider,
                        u.plan,
                        u.free_run_limit,
                        u.created_at,
                        u.last_seen_at,
                        u.onboarding_completed_at,
                        u.referral_source,
                        u.life_stage,
                        u.occupation,
                        COUNT(DISTINCT r.run_id) AS run_count,
                        COUNT(DISTINCT i.session_id) AS intake_count,
                        COUNT(DISTINCT f.feedback_id) AS feedback_count
                    FROM users u
                    LEFT JOIN runs r ON r.user_id = u.user_id
                    LEFT JOIN intake_sessions i ON i.user_id = u.user_id
                    LEFT JOIN user_feedback f ON f.user_id = u.user_id
                    GROUP BY u.user_id
                    ORDER BY u.last_seen_at DESC
                    LIMIT ?
                    """,
                    (safe_limit,),
                ).fetchall()
            ]

    def admin_runs(self, *, limit: int = 50) -> list[dict[str, Any]]:
        self.init_db()
        safe_limit = max(1, min(limit, 200))
        with self._connect() as conn:
            return [
                self._row_to_json_dict(row, ("input_json", "target_filter_json", "intake_context_json", "error_json"))
                for row in conn.execute(
                    """
                    SELECT
                        r.run_id,
                        r.user_email,
                        r.simulation_type,
                        r.status,
                        r.sample_size,
                        r.done_count,
                        r.total_count,
                        r.input_json,
                        r.target_filter_json,
                        r.intake_context_json,
                        r.created_at,
                        r.started_at,
                        r.completed_at,
                        r.error_json,
                        i.session_id AS intake_session_id
                    FROM runs r
                    LEFT JOIN intake_sessions i ON i.run_id = r.run_id
                    ORDER BY r.created_at DESC
                    LIMIT ?
                    """,
                    (safe_limit,),
                ).fetchall()
            ]

    def admin_feedback(self, *, limit: int = 50) -> list[dict[str, Any]]:
        self.init_db()
        safe_limit = max(1, min(limit, 200))
        with self._connect() as conn:
            return [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT
                        f.feedback_id,
                        f.user_email,
                        f.run_id,
                        f.intake_session_id,
                        f.usefulness_score,
                        f.trust_score,
                        f.actionability_score,
                        f.result_expectation,
                        f.free_text,
                        fo.intended_action,
                        fo.decision_confidence_before,
                        fo.decision_confidence_after,
                        fo.shared_with_team,
                        fo.exported_report,
                        f.created_at
                    FROM user_feedback f
                    LEFT JOIN result_followups fo
                        ON fo.run_id = f.run_id
                        AND COALESCE(fo.user_id, '') = COALESCE(f.user_id, '')
                    ORDER BY f.created_at DESC
                    LIMIT ?
                    """,
                    (safe_limit,),
                ).fetchall()
            ]

    def admin_export(self, *, retention_days: int) -> dict[str, Any]:
        return {
            "schema_version": "arabesque-admin-export/v1",
            "generated_at": _utc_now(),
            "policy": self.admin_policy(retention_days=retention_days),
            "overview": self.admin_overview(),
            "funnel": self.admin_funnel(),
            "accounts": self.admin_accounts(limit=200),
            "users": self.admin_users(limit=200),
            "runs": self.admin_runs(limit=200),
            "feedback": self.admin_feedback(limit=200),
        }

    def delete_user_data(self, *, user_id: str) -> dict[str, Any]:
        self.init_db()
        with self._connect() as conn:
            user = conn.execute("SELECT user_id, email FROM users WHERE user_id = ?", (user_id,)).fetchone()
            if user is None:
                raise KeyError(user_id)
            run_ids = [
                row["run_id"]
                for row in conn.execute("SELECT run_id FROM runs WHERE user_id = ?", (user_id,)).fetchall()
            ]
            session_ids = [
                row["session_id"]
                for row in conn.execute(
                    "SELECT session_id FROM intake_sessions WHERE user_id = ?",
                    (user_id,),
                ).fetchall()
            ]
            counts: dict[str, int] = {}
            if run_ids:
                placeholders = ",".join("?" for _ in run_ids)
                cursor = conn.execute(
                    f"""
                    DELETE FROM interview_messages
                    WHERE thread_id IN (
                        SELECT thread_id FROM interview_threads WHERE run_id IN ({placeholders})
                    )
                    """,
                    run_ids,
                )
                counts["interview_messages"] = cursor.rowcount
                cursor = conn.execute(
                    f"DELETE FROM interview_threads WHERE run_id IN ({placeholders})",
                    run_ids,
                )
                counts["interview_threads"] = cursor.rowcount
                for table in (
                    "run_partial_results",
                    "run_results",
                    "run_events",
                    "agent_runs",
                    "orchestration_checkpoints",
                ):
                    cursor = conn.execute(f"DELETE FROM {table} WHERE run_id IN ({placeholders})", run_ids)
                    counts[table] = cursor.rowcount
            if session_ids:
                placeholders = ",".join("?" for _ in session_ids)
                for table in ("intake_messages", "intake_events"):
                    cursor = conn.execute(f"DELETE FROM {table} WHERE session_id IN ({placeholders})", session_ids)
                    counts[table] = cursor.rowcount
            cursor = conn.execute(
                """
                DELETE FROM interview_messages
                WHERE thread_id IN (SELECT thread_id FROM interview_threads WHERE user_id = ?)
                """,
                (user_id,),
            )
            counts["interview_messages"] = counts.get("interview_messages", 0) + cursor.rowcount
            cursor = conn.execute("DELETE FROM interview_threads WHERE user_id = ?", (user_id,))
            counts["interview_threads"] = counts.get("interview_threads", 0) + cursor.rowcount
            for table in ("analytics_events", "user_feedback", "result_followups", "interactive_llm_usage", "usage_ledger", "intake_sessions", "runs"):
                cursor = conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
                counts[table] = counts.get(table, 0) + cursor.rowcount
            cursor = conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            counts["users"] = cursor.rowcount
        return {
            "deleted": True,
            "user_id": user_id,
            "user_email": user["email"],
            "counts": counts,
        }

    def prune_retention(self, *, retention_days: int, dry_run: bool = True) -> dict[str, Any]:
        self.init_db()
        cutoff = _days_ago(retention_days)
        deletable_statuses = ("completed", "failed", "canceled", "interrupted")
        with self._connect() as conn:
            run_ids = [
                row["run_id"]
                for row in conn.execute(
                    """
                    SELECT run_id
                    FROM runs
                    WHERE created_at < ?
                        AND status IN (?, ?, ?, ?)
                    """,
                    (cutoff, *deletable_statuses),
                ).fetchall()
            ]
            counts: dict[str, int] = {"runs": len(run_ids)}
            for table in ("analytics_events", "admin_audit_events", "interactive_llm_usage"):
                row = conn.execute(
                    f"SELECT COUNT(*) AS value FROM {table} WHERE created_at < ?",
                    (cutoff,),
                ).fetchone()
                counts[table] = int(row["value"] if row else 0)
            if dry_run:
                return {
                    "dry_run": True,
                    "retention_days": retention_days,
                    "cutoff": cutoff,
                    "counts": counts,
                }
            if run_ids:
                placeholders = ",".join("?" for _ in run_ids)
                cursor = conn.execute(
                    f"""
                    DELETE FROM interview_messages
                    WHERE thread_id IN (
                        SELECT thread_id FROM interview_threads WHERE run_id IN ({placeholders})
                    )
                    """,
                    run_ids,
                )
                counts["interview_messages"] = cursor.rowcount
                cursor = conn.execute(
                    f"DELETE FROM interview_threads WHERE run_id IN ({placeholders})",
                    run_ids,
                )
                counts["interview_threads"] = cursor.rowcount
                for table in (
                    "run_partial_results",
                    "run_results",
                    "run_events",
                    "agent_runs",
                    "orchestration_checkpoints",
                ):
                    cursor = conn.execute(f"DELETE FROM {table} WHERE run_id IN ({placeholders})", run_ids)
                    counts[table] = cursor.rowcount
                cursor = conn.execute(f"DELETE FROM runs WHERE run_id IN ({placeholders})", run_ids)
                counts["runs"] = cursor.rowcount
            for table in ("analytics_events", "admin_audit_events", "interactive_llm_usage"):
                cursor = conn.execute(f"DELETE FROM {table} WHERE created_at < ?", (cutoff,))
                counts[table] = cursor.rowcount
        return {
            "dry_run": False,
            "retention_days": retention_days,
            "cutoff": cutoff,
            "counts": counts,
        }

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
                    persona_pool, country_id,
                    user_id, user_email,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    getattr(request, "persona_pool", "nationwide"),
                    request.country_id,
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
        free_run_limit: int = 0,
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
                "SELECT created_at, plan FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            plan = existing["plan"] if existing else "free"
            # Always sync free_run_limit from current policy (0 = unlimited).
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
                              free_run_limit = excluded.free_run_limit,
                              last_seen_at = excluded.last_seen_at
                """,
                (user_id, email, name, provider, plan, free_run_limit, created_at, now),
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

    def save_user_onboarding(
        self,
        user_id: str,
        *,
        referral_source: str,
        life_stage: str,
        occupation: str,
    ) -> UserRecord:
        """Persist first-login onboarding answers and mark the user complete."""

        self.init_db()
        now = _utc_now()
        occupation_clean = occupation.strip()
        if not occupation_clean:
            raise ValueError("occupation must not be empty")
        if len(occupation_clean) > 80:
            raise ValueError("occupation must be at most 80 characters")
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT user_id FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if existing is None:
                raise KeyError(user_id)
            conn.execute(
                """
                UPDATE users
                SET referral_source = ?,
                    life_stage = ?,
                    occupation = ?,
                    onboarding_completed_at = ?,
                    last_seen_at = ?
                WHERE user_id = ?
                """,
                (
                    referral_source,
                    life_stage,
                    occupation_clean,
                    now,
                    now,
                    user_id,
                ),
            )
        record = self.get_user(user_id)
        if record is None:
            raise RuntimeError(f"User was not persisted: {user_id}")
        return record

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
        free_run_limit: int | None = None,
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
        # free_run_limit <= 0 means unlimited. Optional override lets callers use
        # current config policy without waiting for user-row migration.
        effective_limit = (
            int(free_run_limit)
            if free_run_limit is not None
            else int(user["free_run_limit"])
        )
        unlimited = effective_limit <= 0 or quota_bypass
        remaining_runs = 0 if effective_limit <= 0 else max(0, effective_limit - used_runs)
        return UserUsageRecord(
            user_id=user["user_id"],
            email=user["email"],
            plan=user["plan"],
            free_run_limit=effective_limit,
            used_runs=used_runs,
            remaining_runs=remaining_runs,
            can_create_run=unlimited or used_runs < effective_limit,
            quota_bypass=quota_bypass,
        )

    def try_consume_interactive_llm_action(
        self,
        *,
        user_id: str,
        action_type: str,
        limit: int,
        window_seconds: int = 3600,
    ) -> tuple[bool, int]:
        """Atomically reserve one bounded interactive LLM action."""

        self.init_db()
        safe_limit = max(1, limit)
        cutoff = (datetime.now(UTC) - timedelta(seconds=max(1, window_seconds))).isoformat()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """
                SELECT COUNT(*) AS value
                FROM interactive_llm_usage
                WHERE user_id = ? AND action_type = ? AND created_at >= ?
                """,
                (user_id, action_type, cutoff),
            ).fetchone()
            used = int(row["value"] if row else 0)
            if used >= safe_limit:
                return False, 0
            conn.execute(
                """
                INSERT INTO interactive_llm_usage (action_id, user_id, action_type, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (str(uuid4()), user_id, action_type, now),
            )
            conn.execute(
                "DELETE FROM interactive_llm_usage WHERE created_at < ?",
                ((datetime.now(UTC) - timedelta(days=30)).isoformat(),),
            )
        return True, max(0, safe_limit - used - 1)

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
            # free_run_limit <= 0 means unlimited.
            if free_run_limit > 0 and used_runs >= free_run_limit:
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

    def create_project(
        self,
        *,
        user: UserRecord,
        name: str,
        description: str = "",
        kind: str = "venture",
        product_context: dict[str, Any] | None = None,
        features: list[str] | None = None,
        prices: list[str] | None = None,
        target_notes: str = "",
        alternatives: list[str] | None = None,
        project_id: str | None = None,
    ) -> ProjectRecord:
        self.init_db()
        now = _utc_now()
        project_id = project_id or str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO projects (
                    project_id, user_id, name, description, kind, product_context_json,
                    features_json, prices_json, target_notes, alternatives_json,
                    created_at, updated_at, archived_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    project_id,
                    user.user_id,
                    name.strip(),
                    description.strip(),
                    (kind or "venture").strip().lower(),
                    _json_dumps(product_context or {}),
                    _json_dumps(features or []),
                    _json_dumps(prices or []),
                    target_notes.strip(),
                    _json_dumps(alternatives or []),
                    now,
                    now,
                ),
            )
        project = self.get_project(project_id)
        if project is None:
            raise RuntimeError(f"Project was not persisted: {project_id}")
        return project

    def list_projects(self, user_id: str, include_archived: bool = False) -> list[ProjectRecord]:
        self.init_db()
        archived_clause = "" if include_archived else "AND archived_at IS NULL"
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM projects
                WHERE user_id = ? {archived_clause}
                ORDER BY updated_at DESC, created_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [self._row_to_project(row) for row in rows]

    def get_project(self, project_id: str) -> ProjectRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        return self._row_to_project(row) if row else None

    def update_project(
        self,
        project_id: str,
        *,
        user_id: str,
        name: str,
        description: str = "",
        product_context: dict[str, Any] | None = None,
        features: list[str] | None = None,
        prices: list[str] | None = None,
        target_notes: str = "",
        alternatives: list[str] | None = None,
        kind: str | None = None,
    ) -> ProjectRecord | None:
        """kind=None은 '갈래 유지'를 뜻한다. 기본값으로 덮어쓰지 않는다."""
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE projects
                SET name = ?, description = ?, kind = COALESCE(?, kind), product_context_json = ?,
                    features_json = ?, prices_json = ?, target_notes = ?,
                    alternatives_json = ?, updated_at = ?
                WHERE project_id = ? AND user_id = ? AND archived_at IS NULL
                """,
                (
                    name.strip(),
                    description.strip(),
                    kind.strip().lower() if kind else None,
                    _json_dumps(product_context or {}),
                    _json_dumps(features or []),
                    _json_dumps(prices or []),
                    target_notes.strip(),
                    _json_dumps(alternatives or []),
                    now,
                    project_id,
                    user_id,
                ),
            )
            row = conn.execute(
                "SELECT * FROM projects WHERE project_id = ? AND user_id = ?",
                (project_id, user_id),
            ).fetchone()
        return self._row_to_project(row) if row else None

    def archive_project(self, project_id: str, user_id: str) -> ProjectRecord | None:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE projects
                SET archived_at = ?, updated_at = ?
                WHERE project_id = ? AND user_id = ? AND archived_at IS NULL
                """,
                (now, now, project_id, user_id),
            )
            row = conn.execute(
                "SELECT * FROM projects WHERE project_id = ? AND user_id = ?",
                (project_id, user_id),
            ).fetchone()
        return self._row_to_project(row) if row else None

    def attach_project_run(
        self,
        *,
        project_id: str,
        run_id: str,
        user_id: str,
        derived_from_run_id: str | None = None,
        run_label: str | None = None,
    ) -> ProjectRunRecord:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            project = conn.execute(
                """
                SELECT project_id FROM projects
                WHERE project_id = ? AND user_id = ? AND archived_at IS NULL
                """,
                (project_id, user_id),
            ).fetchone()
            run = conn.execute(
                "SELECT run_id FROM runs WHERE run_id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
            if project is None or run is None:
                raise ValueError("Project and run must belong to the same user.")
            conn.execute(
                """
                INSERT OR IGNORE INTO project_runs (
                    project_id, run_id, derived_from_run_id, run_label, created_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (project_id, run_id, derived_from_run_id, run_label, now),
            )
            row = conn.execute(
                "SELECT * FROM project_runs WHERE project_id = ? AND run_id = ?",
                (project_id, run_id),
            ).fetchone()
        if row is None:
            raise RuntimeError(f"Project run link was not persisted: {project_id}/{run_id}")
        return self._row_to_project_run(row)

    def list_project_runs(
        self,
        project_id: str,
        user_id: str,
        *,
        limit: int = 20,
    ) -> list[tuple[ProjectRunRecord, RunRecord]]:
        self.init_db()
        safe_limit = max(1, min(limit, 200))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT pr.project_id, pr.run_id, pr.derived_from_run_id,
                       pr.run_label, pr.created_at AS link_created_at, r.*
                FROM project_runs pr
                JOIN projects p ON p.project_id = pr.project_id
                JOIN runs r ON r.run_id = pr.run_id
                WHERE pr.project_id = ? AND p.user_id = ?
                ORDER BY pr.created_at DESC
                LIMIT ?
                """,
                (project_id, user_id, safe_limit),
            ).fetchall()
        pairs: list[tuple[ProjectRunRecord, RunRecord]] = []
        for row in rows:
            link = ProjectRunRecord(
                project_id=str(row["project_id"]),
                run_id=str(row["run_id"]),
                derived_from_run_id=row["derived_from_run_id"],
                run_label=row["run_label"],
                created_at=str(row["link_created_at"]),
            )
            pairs.append((link, self._row_to_run(row)))
        return pairs

    def get_project_run(self, project_id: str, run_id: str) -> ProjectRunRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM project_runs WHERE project_id = ? AND run_id = ?",
                (project_id, run_id),
            ).fetchone()
        return self._row_to_project_run(row) if row else None

    def get_project_for_run(self, run_id: str) -> ProjectRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT p.*
                FROM project_runs pr
                JOIN projects p ON p.project_id = pr.project_id
                WHERE pr.run_id = ?
                ORDER BY pr.created_at DESC
                LIMIT 1
                """,
                (run_id,),
            ).fetchone()
        return self._row_to_project(row) if row else None

    def get_or_create_interview_thread(
        self,
        *,
        user_id: str,
        project_id: str,
        run_id: str,
        subject_uuid: str,
        subject_label: str = "",
        subject_meta: str = "",
        context_quote: str = "",
    ) -> InterviewThreadRecord:
        self.init_db()
        now = _utc_now()
        thread_id = str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO interview_threads (
                    thread_id, user_id, project_id, run_id, subject_uuid,
                    subject_label, subject_meta, context_quote, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, run_id, subject_uuid)
                DO UPDATE SET
                    subject_label = CASE
                        WHEN excluded.subject_label = '' THEN interview_threads.subject_label
                        ELSE excluded.subject_label
                    END,
                    subject_meta = CASE
                        WHEN excluded.subject_meta = '' THEN interview_threads.subject_meta
                        ELSE excluded.subject_meta
                    END,
                    context_quote = CASE
                        WHEN excluded.context_quote = '' THEN interview_threads.context_quote
                        ELSE excluded.context_quote
                    END
                """,
                (
                    thread_id,
                    user_id,
                    project_id,
                    run_id,
                    subject_uuid,
                    subject_label.strip(),
                    subject_meta.strip(),
                    context_quote.strip(),
                    now,
                    now,
                ),
            )
            row = conn.execute(
                """
                SELECT * FROM interview_threads
                WHERE user_id = ? AND run_id = ? AND subject_uuid = ?
                """,
                (user_id, run_id, subject_uuid),
            ).fetchone()
        if row is None:
            raise RuntimeError(f"Interview thread was not persisted: {run_id}/{subject_uuid}")
        return self._row_to_interview_thread(row)

    def list_interview_threads(self, *, user_id: str, run_id: str) -> list[InterviewThreadRecord]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM interview_threads
                WHERE user_id = ? AND run_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (user_id, run_id),
            ).fetchall()
        return [self._row_to_interview_thread(row) for row in rows]

    def get_interview_thread(self, *, user_id: str, thread_id: str) -> InterviewThreadRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM interview_threads WHERE user_id = ? AND thread_id = ?",
                (user_id, thread_id),
            ).fetchone()
        return self._row_to_interview_thread(row) if row else None

    def list_interview_messages(self, thread_id: str) -> list[InterviewMessageRecord]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM interview_messages
                WHERE thread_id = ?
                ORDER BY ordinal ASC, created_at ASC
                """,
                (thread_id,),
            ).fetchall()
        return [self._row_to_interview_message(row) for row in rows]

    def append_interview_exchange(
        self,
        *,
        user_id: str,
        thread_id: str,
        question: str,
        answer: str,
        assistant_metadata: dict[str, Any] | None = None,
    ) -> tuple[InterviewMessageRecord, InterviewMessageRecord]:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            thread = conn.execute(
                "SELECT thread_id FROM interview_threads WHERE thread_id = ? AND user_id = ?",
                (thread_id, user_id),
            ).fetchone()
            if thread is None:
                raise KeyError(thread_id)
            row = conn.execute(
                "SELECT COALESCE(MAX(ordinal), -1) AS value FROM interview_messages WHERE thread_id = ?",
                (thread_id,),
            ).fetchone()
            first_ordinal = int(row["value"] if row else -1) + 1
            user_message_id = str(uuid4())
            assistant_message_id = str(uuid4())
            conn.execute(
                """
                INSERT INTO interview_messages (
                    message_id, thread_id, role, content, ordinal, metadata_json, created_at
                )
                VALUES (?, ?, 'user', ?, ?, '{}', ?)
                """,
                (user_message_id, thread_id, question.strip(), first_ordinal, now),
            )
            conn.execute(
                """
                INSERT INTO interview_messages (
                    message_id, thread_id, role, content, ordinal, metadata_json, created_at
                )
                VALUES (?, ?, 'assistant', ?, ?, ?, ?)
                """,
                (
                    assistant_message_id,
                    thread_id,
                    answer.strip(),
                    first_ordinal + 1,
                    _json_dumps(assistant_metadata or {}),
                    now,
                ),
            )
            conn.execute("UPDATE interview_threads SET updated_at = ? WHERE thread_id = ?", (now, thread_id))
        return (
            InterviewMessageRecord(
                message_id=user_message_id,
                thread_id=thread_id,
                role="user",
                content=question.strip(),
                ordinal=first_ordinal,
                created_at=now,
            ),
            InterviewMessageRecord(
                message_id=assistant_message_id,
                thread_id=thread_id,
                role="assistant",
                content=answer.strip(),
                ordinal=first_ordinal + 1,
                metadata=assistant_metadata or {},
                created_at=now,
            ),
        )

    def user_owns_run(self, user_id: str, run_id: str) -> bool:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE run_id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
        return row is not None

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

    def get_run_status(self, run_id: str) -> RunStatusValue | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT status FROM runs WHERE run_id = ?", (run_id,)
            ).fetchone()
        if row is None:
            return None
        return RunStatusValue(row["status"])

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

    def upsert_partial_results_bulk(
        self,
        run_id: str,
        items: list[tuple[str, dict[str, Any]]],
    ) -> None:
        if not items:
            return
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO run_partial_results (run_id, persona_uuid, result_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(run_id, persona_uuid)
                DO UPDATE SET result_json = excluded.result_json, updated_at = excluded.updated_at
                """,
                [(run_id, persona_uuid, _json_dumps(result), now) for persona_uuid, result in items],
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

    def save_run_token_usage(self, run_id: str, usage: dict[str, Any] | None) -> None:
        if not usage:
            return
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                "UPDATE runs SET token_usage_json = ?, updated_at = ? WHERE run_id = ?",
                (_json_dumps(usage), now, run_id),
            )

    def get_run_token_usage(self, run_id: str) -> dict[str, Any] | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT token_usage_json FROM runs WHERE run_id = ?", (run_id,)
            ).fetchone()
        if row is None or not row["token_usage_json"]:
            return None
        loaded = _json_loads(row["token_usage_json"], {})
        return loaded if isinstance(loaded, dict) else None

    def list_run_token_usage(self) -> list[dict[str, Any]]:
        """Return per-run token usage rows for completed runs (cost reporting)."""

        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT run_id, simulation_type, sample_size, status, model_alias,
                       token_usage_json, created_at
                FROM runs
                WHERE token_usage_json IS NOT NULL AND token_usage_json != ''
                ORDER BY created_at ASC
                """
            ).fetchall()
        entries: list[dict[str, Any]] = []
        for row in rows:
            usage = _json_loads(row["token_usage_json"], {})
            if not isinstance(usage, dict):
                continue
            entries.append(
                {
                    "run_id": row["run_id"],
                    "simulation_type": row["simulation_type"],
                    "sample_size": row["sample_size"],
                    "status": row["status"],
                    "model_alias": row["model_alias"],
                    "created_at": row["created_at"],
                    "token_usage": usage,
                }
            )
        return entries

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
        return [
            RunEventRecord(
                run_id=row["run_id"],
                event_type=RunEventType(row["event_type"]),
                payload=_json_loads(row["payload_json"], {}),
                event_id=str(row["rowid"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

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
            if (
                existing
                and existing["user_id"]
                and (user is None or existing["user_id"] != user.user_id)
            ):
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
            if row["user_id"] != user_id:
                raise KeyError(session_id)
            run_row = conn.execute(
                "SELECT user_id FROM runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            if run_row is None or run_row["user_id"] != row["user_id"]:
                raise KeyError(run_id)
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
        if row["user_id"] != user_id:
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
        where_clause = "WHERE user_id = ?" if user_id is not None else "WHERE user_id IS NULL"
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
        where_clause = "WHERE user_id = ?" if user_id is not None else "WHERE user_id IS NULL"
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

    def upsert_oauth_client(
        self,
        *,
        client_id: str,
        client_name: str,
        redirect_uris: list[str],
        grant_types: list[str] | None = None,
        token_endpoint_auth_method: str = "none",
        is_dynamic: bool = False,
    ) -> dict[str, Any]:
        self.init_db()
        now = _utc_now()
        grants = grant_types or ["authorization_code", "refresh_token"]
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_clients (
                    client_id, client_name, redirect_uris_json, grant_types_json,
                    token_endpoint_auth_method, is_dynamic, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(client_id)
                DO UPDATE SET client_name = excluded.client_name,
                              redirect_uris_json = excluded.redirect_uris_json,
                              grant_types_json = excluded.grant_types_json,
                              token_endpoint_auth_method = excluded.token_endpoint_auth_method
                """,
                (
                    client_id,
                    client_name,
                    _json_dumps(redirect_uris),
                    _json_dumps(grants),
                    token_endpoint_auth_method,
                    1 if is_dynamic else 0,
                    now,
                ),
            )
        client = self.get_oauth_client(client_id)
        if client is None:
            raise RuntimeError(f"OAuth client was not persisted: {client_id}")
        return client

    def get_oauth_client(self, client_id: str) -> dict[str, Any] | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM oauth_clients WHERE client_id = ?",
                (client_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "client_id": row["client_id"],
            "client_name": row["client_name"],
            "redirect_uris": _json_loads(row["redirect_uris_json"], []),
            "grant_types": _json_loads(row["grant_types_json"], []),
            "token_endpoint_auth_method": row["token_endpoint_auth_method"],
            "is_dynamic": bool(row["is_dynamic"]),
            "created_at": row["created_at"],
        }

    def create_oauth_grant(
        self,
        *,
        user_id: str,
        client_id: str,
        client_name: str,
        scope: str,
        resource: str,
    ) -> dict[str, Any]:
        self.init_db()
        now = _utc_now()
        grant_id = str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_grants (
                    grant_id, client_id, user_id, client_name, scope, resource,
                    created_at, last_used_at, revoked_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (grant_id, client_id, user_id, client_name, scope, resource, now, now),
            )
        grant = self.get_oauth_grant(grant_id)
        if grant is None:
            raise RuntimeError(f"OAuth grant was not persisted: {grant_id}")
        return grant

    def get_oauth_grant(self, grant_id: str) -> dict[str, Any] | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM oauth_grants WHERE grant_id = ?",
                (grant_id,),
            ).fetchone()
        return self._row_to_oauth_grant(row) if row else None

    def list_oauth_grants(self, user_id: str, *, include_revoked: bool = False) -> list[dict[str, Any]]:
        self.init_db()
        with self._connect() as conn:
            if include_revoked:
                rows = conn.execute(
                    """
                    SELECT * FROM oauth_grants
                    WHERE user_id = ?
                    ORDER BY created_at DESC
                    """,
                    (user_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM oauth_grants
                    WHERE user_id = ? AND revoked_at IS NULL
                    ORDER BY created_at DESC
                    """,
                    (user_id,),
                ).fetchall()
        return [self._row_to_oauth_grant(row) for row in rows]

    def revoke_oauth_grant(self, grant_id: str, *, user_id: str) -> dict[str, Any] | None:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM oauth_grants WHERE grant_id = ? AND user_id = ?",
                (grant_id, user_id),
            ).fetchone()
            if row is None:
                return None
            conn.execute(
                "UPDATE oauth_grants SET revoked_at = ? WHERE grant_id = ?",
                (now, grant_id),
            )
            conn.execute(
                """
                UPDATE oauth_tokens
                SET revoked_at = ?
                WHERE grant_id = ? AND revoked_at IS NULL
                """,
                (now, grant_id),
            )
        return self.get_oauth_grant(grant_id)

    def create_oauth_auth_code(
        self,
        *,
        code: str,
        client_id: str,
        user_id: str,
        grant_id: str,
        redirect_uri: str,
        scope: str,
        resource: str,
        code_challenge: str,
        code_challenge_method: str,
        expires_at: str,
    ) -> None:
        self.init_db()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_auth_codes (
                    code_hash, client_id, user_id, grant_id, redirect_uri, scope, resource,
                    code_challenge, code_challenge_method, expires_at, used_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
                """,
                (
                    _token_digest(code),
                    client_id,
                    user_id,
                    grant_id,
                    redirect_uri,
                    scope,
                    resource,
                    code_challenge,
                    code_challenge_method,
                    expires_at,
                    _utc_now(),
                ),
            )

    def consume_oauth_auth_code(
        self,
        *,
        code: str,
        client_id: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict[str, Any] | None:
        self.init_db()
        code_hash = _token_digest(code)
        now = _utc_now()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM oauth_auth_codes WHERE code_hash = ?",
                (code_hash,),
            ).fetchone()
            if row is None:
                return None
            if row["used_at"] is not None:
                return None
            if row["client_id"] != client_id:
                return None
            if row["redirect_uri"] != redirect_uri:
                return None
            if _parse_iso(row["expires_at"]) <= datetime.now(UTC):
                return None
            if row["code_challenge_method"] != "S256":
                return None
            expected = (
                base64.urlsafe_b64encode(sha256(code_verifier.encode("utf-8")).digest())
                .decode("ascii")
                .rstrip("=")
            )
            if expected != row["code_challenge"]:
                return None
            conn.execute(
                "UPDATE oauth_auth_codes SET used_at = ? WHERE code_hash = ?",
                (now, code_hash),
            )
            return {
                "client_id": row["client_id"],
                "user_id": row["user_id"],
                "grant_id": row["grant_id"],
                "scope": row["scope"],
                "resource": row["resource"],
                "redirect_uri": row["redirect_uri"],
            }

    def issue_oauth_token_pair(
        self,
        *,
        client_id: str,
        user_id: str,
        grant_id: str,
        scope: str,
        resource: str,
        access_token: str,
        refresh_token: str,
        access_expires_at: str,
        refresh_expires_at: str,
        parent_token_id: str | None = None,
    ) -> dict[str, str]:
        self.init_db()
        now = _utc_now()
        access_id = str(uuid4())
        refresh_id = str(uuid4())
        with self._connect() as conn:
            for token_id, raw, token_type, expires_at in (
                (access_id, access_token, "access", access_expires_at),
                (refresh_id, refresh_token, "refresh", refresh_expires_at),
            ):
                conn.execute(
                    """
                    INSERT INTO oauth_tokens (
                        token_id, token_hash, token_type, client_id, user_id, grant_id,
                        scope, resource, expires_at, revoked_at, parent_token_id,
                        created_at, last_used_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
                    """,
                    (
                        token_id,
                        _token_digest(raw),
                        token_type,
                        client_id,
                        user_id,
                        grant_id,
                        scope,
                        resource,
                        expires_at,
                        parent_token_id if token_type == "refresh" else None,
                        now,
                        now,
                    ),
                )
            conn.execute(
                "UPDATE oauth_grants SET last_used_at = ? WHERE grant_id = ?",
                (now, grant_id),
            )
        return {"access_token_id": access_id, "refresh_token_id": refresh_id}

    def resolve_oauth_access_token(self, raw_token: str) -> dict[str, Any] | None:
        self.init_db()
        now = datetime.now(UTC)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT t.*, g.revoked_at AS grant_revoked_at
                FROM oauth_tokens t
                JOIN oauth_grants g ON g.grant_id = t.grant_id
                WHERE t.token_hash = ? AND t.token_type = 'access'
                """,
                (_token_digest(raw_token),),
            ).fetchone()
            if row is None:
                return None
            if row["revoked_at"] is not None or row["grant_revoked_at"] is not None:
                return None
            if _parse_iso(row["expires_at"]) <= now:
                return None
            stamp = _utc_now()
            conn.execute(
                "UPDATE oauth_tokens SET last_used_at = ? WHERE token_id = ?",
                (stamp, row["token_id"]),
            )
            conn.execute(
                "UPDATE oauth_grants SET last_used_at = ? WHERE grant_id = ?",
                (stamp, row["grant_id"]),
            )
            return {
                "token_id": row["token_id"],
                "client_id": row["client_id"],
                "user_id": row["user_id"],
                "grant_id": row["grant_id"],
                "scope": row["scope"],
                "resource": row["resource"],
            }

    def rotate_oauth_refresh_token(
        self,
        *,
        refresh_token: str,
        client_id: str,
        new_access_token: str,
        new_refresh_token: str,
        access_expires_at: str,
        refresh_expires_at: str,
    ) -> dict[str, Any] | None:
        self.init_db()
        now = datetime.now(UTC)
        stamp = _utc_now()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT t.*, g.revoked_at AS grant_revoked_at
                FROM oauth_tokens t
                JOIN oauth_grants g ON g.grant_id = t.grant_id
                WHERE t.token_hash = ? AND t.token_type = 'refresh'
                """,
                (_token_digest(refresh_token),),
            ).fetchone()
            if row is None:
                return None
            if row["client_id"] != client_id:
                return None
            if row["revoked_at"] is not None or row["grant_revoked_at"] is not None:
                return None
            if _parse_iso(row["expires_at"]) <= now:
                return None
            conn.execute(
                "UPDATE oauth_tokens SET revoked_at = ? WHERE token_id = ?",
                (stamp, row["token_id"]),
            )
            access_id = str(uuid4())
            refresh_id = str(uuid4())
            for token_id, raw, token_type, expires_at in (
                (access_id, new_access_token, "access", access_expires_at),
                (refresh_id, new_refresh_token, "refresh", refresh_expires_at),
            ):
                conn.execute(
                    """
                    INSERT INTO oauth_tokens (
                        token_id, token_hash, token_type, client_id, user_id, grant_id,
                        scope, resource, expires_at, revoked_at, parent_token_id,
                        created_at, last_used_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
                    """,
                    (
                        token_id,
                        _token_digest(raw),
                        token_type,
                        row["client_id"],
                        row["user_id"],
                        row["grant_id"],
                        row["scope"],
                        row["resource"],
                        expires_at,
                        row["token_id"] if token_type == "refresh" else None,
                        stamp,
                        stamp,
                    ),
                )
            conn.execute(
                "UPDATE oauth_grants SET last_used_at = ? WHERE grant_id = ?",
                (stamp, row["grant_id"]),
            )
            return {
                "user_id": row["user_id"],
                "grant_id": row["grant_id"],
                "scope": row["scope"],
                "resource": row["resource"],
            }

    def _row_to_oauth_grant(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "grant_id": row["grant_id"],
            "client_id": row["client_id"],
            "user_id": row["user_id"],
            "client_name": row["client_name"],
            "scope": row["scope"],
            "resource": row["resource"],
            "created_at": row["created_at"],
            "last_used_at": row["last_used_at"],
            "revoked_at": row["revoked_at"],
        }

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=30000")
        # WAL improves multi-worker concurrent readers/writers on one Mac Studio.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
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

    def _row_to_project(self, row: sqlite3.Row) -> ProjectRecord:
        return ProjectRecord(
            project_id=str(row["project_id"]),
            user_id=str(row["user_id"]),
            name=str(row["name"]),
            description=str(row["description"] or ""),
            kind=str(row["kind"] or "venture") if "kind" in row.keys() else "venture",
            product_context=_json_loads(row["product_context_json"], {}),
            features=_json_loads(row["features_json"], []),
            prices=_json_loads(row["prices_json"], []),
            target_notes=str(row["target_notes"] or ""),
            alternatives=_json_loads(row["alternatives_json"], []),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            archived_at=row["archived_at"],
        )

    def _row_to_project_run(self, row: sqlite3.Row) -> ProjectRunRecord:
        return ProjectRunRecord(
            project_id=str(row["project_id"]),
            run_id=str(row["run_id"]),
            derived_from_run_id=row["derived_from_run_id"],
            run_label=row["run_label"],
            created_at=str(row["created_at"]),
        )

    def _row_to_run(self, row: sqlite3.Row) -> RunRecord:
        keys = set(row.keys())
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
            persona_pool=(row["persona_pool"] if "persona_pool" in row.keys() else None)
            or "nationwide",
            intake_context=_json_loads(row["intake_context_json"], None),
            country_id=str(row["country_id"] if "country_id" in keys and row["country_id"] else "kr"),
            user_id=row["user_id"],
            user_email=row["user_email"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
            error=_json_loads(row["error_json"], None),
        )

    def _row_to_user(self, row: sqlite3.Row) -> UserRecord:
        keys = set(row.keys())
        return UserRecord(
            user_id=row["user_id"],
            email=row["email"],
            name=row["name"],
            provider=row["provider"],
            plan=row["plan"],
            free_run_limit=row["free_run_limit"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
            onboarding_completed_at=(
                row["onboarding_completed_at"] if "onboarding_completed_at" in keys else None
            ),
            referral_source=row["referral_source"] if "referral_source" in keys else None,
            life_stage=row["life_stage"] if "life_stage" in keys else None,
            occupation=row["occupation"] if "occupation" in keys else None,
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

    def _row_to_interview_thread(self, row: sqlite3.Row) -> InterviewThreadRecord:
        return InterviewThreadRecord(
            thread_id=row["thread_id"],
            user_id=row["user_id"],
            project_id=row["project_id"],
            run_id=row["run_id"],
            subject_uuid=row["subject_uuid"],
            subject_label=row["subject_label"],
            subject_meta=row["subject_meta"],
            context_quote=row["context_quote"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _row_to_interview_message(self, row: sqlite3.Row) -> InterviewMessageRecord:
        return InterviewMessageRecord(
            message_id=row["message_id"],
            thread_id=row["thread_id"],
            role=row["role"],
            content=row["content"],
            ordinal=int(row["ordinal"]),
            metadata=_json_loads(row["metadata_json"], {}),
            created_at=row["created_at"],
        )

    def _row_to_json_dict(self, row: sqlite3.Row, json_columns: tuple[str, ...]) -> dict[str, Any]:
        data = dict(row)
        for column in json_columns:
            if column in data:
                data[column.removesuffix("_json")] = _json_loads(data.pop(column), None)
        return data

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


def _token_digest(raw_token: str) -> str:
    return sha256(raw_token.encode("utf-8")).hexdigest()


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


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


def _days_ago(days: int) -> str:
    safe_days = max(1, min(days, 3650))
    return (datetime.now(UTC) - timedelta(days=safe_days)).isoformat()
