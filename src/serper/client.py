"""Serper.dev 비동기 HTTP 클라이언트."""

from __future__ import annotations

from typing import Any

import httpx

from src.serper.errors import SerperError, error_for_status
from src.serper.models import SearchType, SerperResponse, endpoint_for

DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_MAX_RETRIES = 2


class SerperClient:
    """Serper.dev Google Search API 비동기 클라이언트.

    사용법::

        async with SerperClient(api_key="...") as client:
            result = await client.search("한국 관광")
            for item in result.organic:
                print(item.title, item.link)

    컨텍스트 매니저 없이 직접 초기화해도 됩니다::

        client = SerperClient(api_key="...")
        result = await client.search("query")
        await client.aclose()
    """

    def __init__(
        self,
        api_key: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        """
        Args:
            api_key: Serper.dev API 키. None이면 SERPER_API_KEY 환경변수 사용.
            timeout: HTTP 요청 타임아웃 (초).
            max_retries: 재시도 횟수.
            client: 외부에서 생성한 httpx.AsyncClient (선택사항).
        """
        self._api_key: str | None = api_key
        self._timeout = timeout
        self._max_retries = max_retries

        if client is not None:
            self._client = client
            self._owned = False
        else:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout))
            self._owned = True

    # ── 컨텍스트 매니저 ──────────────────────────────────────

    async def __aenter__(self) -> SerperClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """내부 httpx 클라이언트 종료 (소유한 경우만)."""
        if self._owned:
            await self._client.aclose()

    # ── API 키 ────────────────────────────────────────────────

    @property
    def api_key(self) -> str:
        """설정된 API 키 반환. 없으면 환경변수에서 읽어옴."""
        if self._api_key is None:
            import os

            key = os.environ.get("SERPER_API_KEY", "")
            if not key:
                raise SerperError(
                    "SERPER_API_KEY가 설정되지 않았습니다. "
                    "환경변수 또는 생성자 api_key 인자로 전달해주세요."
                )
            self._api_key = key
        return self._api_key

    # ── 핵심 검색 메서드 ─────────────────────────────────────

    async def search(
        self,
        query: str,
        *,
        search_type: SearchType = SearchType.SEARCH,
        gl: str | None = None,
        hl: str | None = None,
        tbs: str | None = None,
        page: int | None = None,
        num: int | None = None,
        extra_params: dict[str, Any] | None = None,
    ) -> SerperResponse:
        """Serper.dev API로 검색을 실행합니다.

        Args:
            query: 검색어.
            search_type: 검색 타입 (SearchType 열거형).
            gl: 국가 코드 (ex: kr, us, jp).
            hl: 언어 코드 (ex: ko, en, ja).
            tbs: 날짜 범위 필터.
            page: 페이지 번호.
            num: 결과 개수 (기본 10).
            extra_params: 추가 파라미터 (검색 타입별 고유 옵션).

        Returns:
            SerperResponse: 파싱된 응답.

        Raises:
            SerperAuthError: API 키가 유효하지 않을 때.
            SerperRateLimitError: Rate limit 초과.
            SerperError: 그 외 API 에러.
        """
        url = endpoint_for(search_type)

        payload: dict[str, Any] = {"q": query}
        if gl:
            payload["gl"] = gl
        if hl:
            payload["hl"] = hl
        if tbs:
            payload["tbs"] = tbs
        if page is not None:
            payload["page"] = page
        if num is not None:
            payload["num"] = num
        if extra_params:
            payload.update(extra_params)

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }

        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                response = await self._client.post(url, json=payload, headers=headers)
            except httpx.TimeoutException as exc:
                last_error = SerperError(
                    f"Serper API 타임아웃 (시도 {attempt + 1}/{self._max_retries + 1}): {exc}",
                    status_code=None,
                )
                continue
            except httpx.HTTPError as exc:
                last_error = SerperError(
                    f"Serper API HTTP 에러: {exc}",
                    status_code=None,
                )
                continue

            if response.is_success:
                data: dict[str, Any] = response.json()
                return SerperResponse(**data, raw=data)

            # 에러 응답 처리
            status_code = response.status_code
            try:
                body: dict[str, Any] = response.json()
                msg = body.get("message", response.text)
            except Exception:
                body = {}
                msg = response.text

            raise error_for_status(status_code, msg, body)

        raise SerperError(
            f"Serper API 최대 재시도 횟수 초과 ({self._max_retries + 1}회). "
            f"마지막 에러: {last_error}",
        ) from last_error

    # ── 편의 메서드 ──────────────────────────────────────────

    async def search_news(
        self,
        query: str,
        *,
        gl: str | None = None,
        hl: str | None = None,
        tbs: str | None = None,
        num: int | None = None,
    ) -> SerperResponse:
        """뉴스 검색 편의 메서드."""
        return await self.search(
            query,
            search_type=SearchType.NEWS,
            gl=gl,
            hl=hl,
            tbs=tbs,
            num=num,
        )

    async def search_images(
        self,
        query: str,
        *,
        gl: str | None = None,
        hl: str | None = None,
        num: int | None = None,
    ) -> SerperResponse:
        """이미지 검색 편의 메서드."""
        return await self.search(
            query,
            search_type=SearchType.IMAGES,
            gl=gl,
            hl=hl,
            num=num,
        )

    async def search_scholar(
        self,
        query: str,
        *,
        gl: str | None = None,
        hl: str | None = None,
        num: int | None = None,
    ) -> SerperResponse:
        """학술 검색 편의 메서드."""
        return await self.search(
            query,
            search_type=SearchType.SCHOLAR,
            gl=gl,
            hl=hl,
            num=num,
        )

    async def autocomplete(
        self,
        query: str,
        *,
        gl: str | None = None,
    ) -> SerperResponse:
        """자동완성 편의 메서드."""
        return await self.search(
            query,
            search_type=SearchType.AUTOCOMPLETE,
            gl=gl,
        )
