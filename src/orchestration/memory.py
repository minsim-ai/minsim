"""Project/session memory schema for Phase 7 orchestration."""
from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class MemoryScope(StrEnum):
    PROJECT = "project"
    SESSION = "session"


class MemoryModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class MemoryEvent(MemoryModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    scope: MemoryScope
    run_id: str | None = None
    simulation_type: str | None = None
    key: str = Field(min_length=1, max_length=120)
    value: dict[str, Any]
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class ProjectMemoryRecord(MemoryModel):
    project_id: str = Field(min_length=1, max_length=120)
    facts: dict[str, Any] = Field(default_factory=dict)
    preferences: dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class SessionMemoryRecord(MemoryModel):
    session_id: str = Field(min_length=1, max_length=120)
    project_id: str = Field(min_length=1, max_length=120)
    run_ids: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


def memory_json_schemas() -> dict[str, Any]:
    """Expose schemas without introducing persona-level memory yet."""

    return {
        "project_memory": ProjectMemoryRecord.model_json_schema(),
        "session_memory": SessionMemoryRecord.model_json_schema(),
        "memory_event": MemoryEvent.model_json_schema(),
        "persona_memory_status": "deferred_until_product_workflow_is_confirmed",
    }
