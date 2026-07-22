"""Event-day sample caps and admission helpers."""
from __future__ import annotations

import pytest

from src.api.schemas import ErrorCode
from src.services.errors import ServiceError


def test_clamp_event_sample_size_respects_event_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    import src.config as config
    import src.runtime.event_mode as event_mode

    monkeypatch.setattr(config, "KORESIM_EVENT_MODE", True)
    monkeypatch.setattr(config, "EVENT_MAX_SAMPLE_SIZE", 100)
    monkeypatch.setattr(config, "MAX_SAMPLE_SIZE", 2000)
    monkeypatch.setattr(event_mode, "KORESIM_EVENT_MODE", True)
    monkeypatch.setattr(event_mode, "EVENT_MAX_SAMPLE_SIZE", 100)
    monkeypatch.setattr(event_mode, "MAX_SAMPLE_SIZE", 2000)

    assert event_mode.clamp_event_sample_size(200) == 100
    assert event_mode.clamp_event_sample_size(50) == 50


def test_effective_presets_in_event_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    import src.runtime.event_mode as event_mode

    monkeypatch.setattr(event_mode, "KORESIM_EVENT_MODE", True)
    monkeypatch.setattr(event_mode, "EVENT_MAX_SAMPLE_SIZE", 300)
    monkeypatch.setattr(event_mode, "MAX_SAMPLE_SIZE", 2000)
    assert event_mode.effective_sample_presets() == [100, 200, 300]


def test_create_run_rejects_when_queue_busy(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from src.api.schemas import RunCreateRequest, SimulationType
    from src.jobs.store import SQLiteRunStore
    from src.services import run_service

    store = SQLiteRunStore(tmp_path / "event.sqlite3")

    monkeypatch.setattr(
        run_service,
        "queue_admission_state",
        lambda: {
            "busy": True,
            "queue_depth": 40,
            "worker_count": 10,
            "max_queued_runs": 40,
            "estimated_wait_seconds": 90,
        },
    )
    monkeypatch.setattr(run_service, "event_mode_enabled", lambda: True)

    with pytest.raises(ServiceError) as exc:
        run_service.create_run_for_user(
            store=store,
            enqueue_run=lambda _rid: "job",
            payload=RunCreateRequest(
                simulation_type=SimulationType.CREATIVE_TESTING,
                input={"creatives": ["A안", "B안"]},
                sample_size=50,
            ),
            user=None,
            page="/app",
        )
    assert exc.value.status_code == 503
    assert exc.value.code == ErrorCode.QUEUE_BUSY


def test_validation_structured_routes_to_strong_model(monkeypatch: pytest.MonkeyPatch) -> None:
    import src.config as config
    import src.llm.router as router

    monkeypatch.setattr(config, "MODEL_PERSONA_DEFAULT", "gpt-5.4-nano")
    monkeypatch.setattr(config, "MODEL_PERSONA_STRONG", "gpt-5.4-mini")
    monkeypatch.setattr(router, "MODEL_PERSONA_DEFAULT", "gpt-5.4-nano")
    monkeypatch.setattr(router, "MODEL_PERSONA_STRONG", "gpt-5.4-mini")
    monkeypatch.setattr(
        router,
        "TASK_MODEL_ALIASES",
        {
            **router.TASK_MODEL_ALIASES,
            "validation_structured_response": "gpt-5.4-mini",
            "persona_response": "gpt-5.4-nano",
        },
    )
    route = router.resolve_model_route("validation_structured_response")
    assert route.model_alias == "gpt-5.4-mini"
