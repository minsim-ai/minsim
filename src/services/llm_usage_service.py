"""Usage controls for synchronous, interactive LLM actions."""
from __future__ import annotations

from src.api.schemas import ErrorCode
from src.config import INTERACTIVE_LLM_ACTIONS_PER_HOUR
from src.jobs.models import UserRecord
from src.jobs.store import SQLiteRunStore
from src.services.errors import ServiceError


def consume_interactive_llm_action(
    *,
    store: SQLiteRunStore,
    user: UserRecord | None,
    action_type: str,
) -> None:
    if user is None:
        return
    allowed, _ = store.try_consume_interactive_llm_action(
        user_id=user.user_id,
        action_type=action_type,
        limit=INTERACTIVE_LLM_ACTIONS_PER_HOUR,
    )
    if not allowed:
        raise ServiceError(
            status_code=429,
            code=ErrorCode.INTERACTIVE_RATE_LIMITED,
            message="Interactive AI action limit reached. Try again later.",
            details={
                "action_type": action_type,
                "limit_per_hour": INTERACTIVE_LLM_ACTIONS_PER_HOUR,
            },
        )
