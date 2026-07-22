"""Serper API 전용 예외."""

from __future__ import annotations

from typing import Any


class SerperError(Exception):
    """Serper API 호출 기본 예외."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response_body: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.response_body = response_body
        super().__init__(message)


class SerperAuthError(SerperError):
    """API 키 인증 실패 (401)."""


class SerperRateLimitError(SerperError):
    """Rate limit 초과 (429)."""


class SerperBadRequestError(SerperError):
    """잘못된 요청 (400)."""


class SerperServerError(SerperError):
    """Serper 서버 에러 (5xx)."""


STATUS_CODE_ERROR_MAP: dict[int, type[SerperError]] = {
    400: SerperBadRequestError,
    401: SerperAuthError,
    403: SerperAuthError,
    429: SerperRateLimitError,
    500: SerperServerError,
    502: SerperServerError,
    503: SerperServerError,
}


def error_for_status(status_code: int, message: str, body: dict[str, Any] | None = None) -> SerperError:
    """HTTP 상태 코드에 대응하는 SerperError 인스턴스 반환."""
    error_cls = STATUS_CODE_ERROR_MAP.get(status_code, SerperError)
    return error_cls(message, status_code=status_code, response_body=body)
