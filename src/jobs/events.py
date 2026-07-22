"""SSE formatting helpers for run events."""
from __future__ import annotations

import json
from typing import Any

from src.api.schemas import RunSnapshot
from src.jobs.models import RunEventRecord


def format_sse_event(event: RunEventRecord) -> str:
    payload: dict[str, Any] = {
        "run_id": event.run_id,
        "event_id": event.event_id,
        "event_type": event.event_type.value,
        "created_at": event.created_at,
        "payload": event.payload,
    }
    return (
        f"id: {event.event_id}\n"
        f"event: {event.event_type.value}\n"
        f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    )


def format_heartbeat(run_id: str) -> str:
    payload = {"run_id": run_id, "event_type": "heartbeat"}
    return f"event: heartbeat\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def format_snapshot(snapshot: RunSnapshot) -> str:
    payload = {
        "run_id": snapshot.run_id,
        "event_type": "snapshot",
        "payload": {"snapshot": snapshot.model_dump(mode="json")},
    }
    return f"event: snapshot\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
