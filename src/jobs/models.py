"""Internal run/job models for workers and persistence."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class RunStatusValue(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    INTERRUPTED = "interrupted"


class RunEventType(StrEnum):
    SNAPSHOT = "snapshot"
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    PROGRESS = "progress"
    PARTIAL_RESULT = "partial_result"
    COMPLETED = "completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    CANCELED = "canceled"
    HEARTBEAT = "heartbeat"


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    simulation_type: str
    input: dict[str, Any]
    sample_size: int
    total_count: int
    target_filter: dict[str, Any] = field(default_factory=dict)
    seed: int = 42
    status: RunStatusValue = RunStatusValue.QUEUED
    done_count: int = 0
    model_alias: str | None = None
    persona_pool: str = "nationwide"
    intake_context: dict[str, Any] | None = None
    country_id: str = "kr"
    user_id: str | None = None
    user_email: str | None = None
    created_at: str = ""
    started_at: str | None = None
    updated_at: str = ""
    completed_at: str | None = None
    error: dict[str, Any] | None = None


@dataclass(frozen=True)
class UserRecord:
    user_id: str
    email: str
    provider: str
    name: str | None = None
    plan: str = "free"
    free_run_limit: int = 0
    created_at: str = ""
    last_seen_at: str = ""
    onboarding_completed_at: str | None = None
    referral_source: str | None = None
    life_stage: str | None = None
    occupation: str | None = None


@dataclass(frozen=True)
class UserUsageRecord:
    user_id: str
    email: str
    plan: str
    free_run_limit: int
    used_runs: int
    remaining_runs: int
    can_create_run: bool
    quota_bypass: bool = False


@dataclass(frozen=True)
class ProjectRecord:
    project_id: str
    user_id: str
    name: str
    description: str = ""
    # 'poll'(여론조사) | 'venture'(사업 아이템 검증). 기존 행은 venture.
    kind: str = "venture"
    product_context: dict[str, Any] = field(default_factory=dict)
    features: list[str] = field(default_factory=list)
    prices: list[str] = field(default_factory=list)
    target_notes: str = ""
    alternatives: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    archived_at: str | None = None


@dataclass(frozen=True)
class ProjectRunRecord:
    project_id: str
    run_id: str
    derived_from_run_id: str | None = None
    run_label: str | None = None
    created_at: str = ""


@dataclass(frozen=True)
class InterviewThreadRecord:
    thread_id: str
    user_id: str
    project_id: str
    run_id: str
    subject_uuid: str
    subject_label: str = ""
    subject_meta: str = ""
    context_quote: str = ""
    created_at: str = ""
    updated_at: str = ""


@dataclass(frozen=True)
class InterviewMessageRecord:
    message_id: str
    thread_id: str
    role: str
    content: str
    ordinal: int
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""


@dataclass(frozen=True)
class RunEventRecord:
    run_id: str
    event_type: RunEventType
    payload: dict[str, Any] = field(default_factory=dict)
    event_id: str | None = None
    created_at: str = ""


@dataclass(frozen=True)
class RunResultRecord:
    run_id: str
    result: dict[str, Any]
    created_at: str = ""


@dataclass(frozen=True)
class AgentRunRecord:
    agent_run_id: str
    run_id: str
    agent_name: str
    task_type: str
    prompt_version: str
    mode: str
    safe_input_digest: str
    safe_input: dict[str, Any]
    output: dict[str, Any]
    scores: dict[str, Any] = field(default_factory=dict)
    provider: str | None = None
    provider_model: str | None = None
    trace_id: str | None = None
    created_at: str = ""


@dataclass(frozen=True)
class OrchestrationCheckpointRecord:
    checkpoint_id: str
    run_id: str
    graph_name: str
    checkpoint_name: str
    state: dict[str, Any]
    created_at: str = ""


@dataclass(frozen=True)
class IntakeSessionRecord:
    session_id: str
    status: str
    snapshot: dict[str, Any]
    title: str | None = None
    run_id: str | None = None
    user_id: str | None = None
    user_email: str | None = None
    created_at: str = ""
    updated_at: str = ""


@dataclass(frozen=True)
class IntakeMessageRecord:
    session_id: str
    role: str
    content: str
    ordinal: int
    message_id: str | None = None
    created_at: str = ""


@dataclass(frozen=True)
class IntakeHistoryRecord:
    session_id: str
    status: str
    title: str
    messages: list[IntakeMessageRecord] = field(default_factory=list)
    run_id: str | None = None
    created_at: str = ""
    updated_at: str = ""


@dataclass(frozen=True)
class IntakeEventRecord:
    session_id: str
    event_type: str
    payload: dict[str, Any] = field(default_factory=dict)
    event_id: str | None = None
    created_at: str = ""
