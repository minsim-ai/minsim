from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.api.schemas import ErrorCode


@dataclass
class ServiceError(Exception):
    status_code: int
    code: ErrorCode | str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def require_authenticated_user(user: Any | None) -> Any:
    if user is None:
        raise ServiceError(
            status_code=401,
            code="AUTH_REQUIRED",
            message="Login is required.",
        )
    return user
