"""Serper API 모듈 테스트."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.serper import SerperClient, SearchType, SerperResponse
from src.serper.errors import SerperAuthError, SerperBadRequestError, SerperError, SerperRateLimitError


# ── fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def sample_search_response() -> dict[str, Any]:
    return {
        "searchParameters": {"q": "test", "type": "search"},
        "organic": [
            {
                "title": "Test Result",
                "link": "https://example.com",
                "snippet": "This is a test snippet",
                "position": 1,
            }
        ],
        "knowledgeGraph": {
            "title": "Test Knowledge",
            "type": "Organization",
            "description": "A test organization",
        },
        "answerBox": {
            "title": "Answer",
            "link": "https://example.com/answer",
            "snippet": "Featured snippet answer",
        },
        "peopleAlsoAsk": [
            {"question": "What is this?", "snippet": "This is...", "title": "", "link": ""}
        ],
        "relatedSearches": [{"query": "test search"}],
    }


@pytest.fixture
def sample_news_response() -> dict[str, Any]:
    return {
        "searchParameters": {"q": "news", "type": "news"},
        "news": [
            {
                "title": "News Title",
                "link": "https://news.example.com",
                "snippet": "News snippet",
                "source": "News Source",
                "date": "2026-07-16",
            }
        ],
    }


@pytest.fixture
def sample_images_response() -> dict[str, Any]:
    return {
        "searchParameters": {"q": "image", "type": "images"},
        "images": [
            {
                "title": "Image Title",
                "imageUrl": "https://example.com/image.jpg",
                "link": "https://example.com",
                "source": "Example",
                "height": 200,
                "width": 300,
            }
        ],
    }


@pytest.fixture
def sample_scholar_response() -> dict[str, Any]:
    return {
        "searchParameters": {"q": "paper", "type": "scholar"},
        "organic": [
            {
                "title": "Research Paper",
                "link": "https://scholar.example.com/paper",
                "snippet": "Paper abstract",
                "publicationInfo": "Journal of Testing, 2026",
                "authors": "Kim, Lee",
                "citationCount": 42,
            }
        ],
    }


@pytest.fixture
def sample_autocomplete_response() -> dict[str, Any]:
    return {
        "searchParameters": {"q": "test", "type": "autocomplete"},
        "suggestions": ["test search", "testing", "test results"],
    }


@pytest.fixture
def mock_httpx_client() -> AsyncMock:
    """기본 mock httpx.AsyncClient."""
    client = AsyncMock(spec=httpx.AsyncClient)
    return client


# ── SerperResponse 파싱 테스트 ─────────────────────────────────


class TestSerperResponseParsing:
    def test_search_response(self, sample_search_response: dict[str, Any]) -> None:
        resp = SerperResponse(**sample_search_response, raw=sample_search_response)
        assert len(resp.organic) == 1
        assert resp.organic[0].title == "Test Result"
        assert resp.organic[0].link == "https://example.com"
        assert resp.knowledgeGraph is not None
        assert resp.knowledgeGraph.title == "Test Knowledge"
        assert resp.answerBox is not None
        assert resp.answerBox.snippet == "Featured snippet answer"
        assert len(resp.peopleAlsoAsk) == 1
        assert len(resp.relatedSearches) == 1
        assert resp.raw is not None

    def test_news_response(self, sample_news_response: dict[str, Any]) -> None:
        resp = SerperResponse(**sample_news_response, raw=sample_news_response)
        assert len(resp.news) == 1
        assert resp.news[0].title == "News Title"
        assert resp.news[0].source == "News Source"

    def test_images_response(self, sample_images_response: dict[str, Any]) -> None:
        resp = SerperResponse(**sample_images_response, raw=sample_images_response)
        assert len(resp.images) == 1
        assert resp.images[0].imageUrl == "https://example.com/image.jpg"
        assert resp.images[0].height == 200

    def test_scholar_response(self, sample_scholar_response: dict[str, Any]) -> None:
        resp = SerperResponse(**sample_scholar_response, raw=sample_scholar_response)
        assert len(resp.organic) == 1
        assert resp.organic[0].title == "Research Paper"

    def test_autocomplete_response(self, sample_autocomplete_response: dict[str, Any]) -> None:
        resp = SerperResponse(**sample_autocomplete_response, raw=sample_autocomplete_response)
        assert len(resp.suggestions) == 3
        assert resp.suggestions[0] == "test search"

    def test_empty_response(self) -> None:
        resp = SerperResponse(**{}, raw={})
        assert resp.organic == []
        assert resp.images == []
        assert resp.news == []
        assert resp.suggestions == []

    def test_extra_fields_preserved(self) -> None:
        data = {"organic": [], "unknownField": "value"}
        resp = SerperResponse(**data, raw=data)
        assert resp.raw == data


# ── SerperClient.search 테스트 ─────────────────────────────────


class TestSerperClientSearch:
    """httpx.AsyncClient를 mock하여 SerperClient 검색 테스트."""

    @pytest.mark.asyncio
    async def test_successful_search(
        self,
        mock_httpx_client: AsyncMock,
        sample_search_response: dict[str, Any],
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = sample_search_response

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        result = await client.search("test")

        assert result.organic[0].title == "Test Result"
        assert result.knowledgeGraph is not None
        mock_httpx_client.post.assert_called_once()
        call_kwargs = mock_httpx_client.post.call_args[1]
        assert call_kwargs["json"]["q"] == "test"
        assert call_kwargs["headers"]["X-API-KEY"] == "test-key"

    @pytest.mark.asyncio
    async def test_search_with_params(
        self,
        mock_httpx_client: AsyncMock,
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {"organic": []}

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        await client.search(
            "korea",
            search_type=SearchType.SEARCH,
            gl="kr",
            hl="ko",
            tbs="qdr:w",
            page=1,
            num=20,
        )

        call_kwargs = mock_httpx_client.post.call_args[1]
        payload = call_kwargs["json"]
        assert payload["gl"] == "kr"
        assert payload["hl"] == "ko"
        assert payload["tbs"] == "qdr:w"
        assert payload["page"] == 1
        assert payload["num"] == 20

    @pytest.mark.asyncio
    async def test_search_type_endpoint(
        self,
        mock_httpx_client: AsyncMock,
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {"news": []}

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        await client.search("news", search_type=SearchType.NEWS)

        call_url = mock_httpx_client.post.call_args[0][0]
        assert "google.serper.dev/news" in call_url

    @pytest.mark.asyncio
    async def test_news_convenience(
        self,
        mock_httpx_client: AsyncMock,
        sample_news_response: dict[str, Any],
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = sample_news_response

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        result = await client.search_news("news")
        assert len(result.news) == 1
        assert result.news[0].title == "News Title"

    @pytest.mark.asyncio
    async def test_images_convenience(
        self,
        mock_httpx_client: AsyncMock,
        sample_images_response: dict[str, Any],
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = sample_images_response

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        result = await client.search_images("image")
        assert len(result.images) == 1

    @pytest.mark.asyncio
    async def test_scholar_convenience(
        self,
        mock_httpx_client: AsyncMock,
        sample_scholar_response: dict[str, Any],
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = sample_scholar_response

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        result = await client.search_scholar("paper")
        assert len(result.organic) == 1

    @pytest.mark.asyncio
    async def test_autocomplete_convenience(
        self,
        mock_httpx_client: AsyncMock,
        sample_autocomplete_response: dict[str, Any],
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = sample_autocomplete_response

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        result = await client.autocomplete("test")
        assert result.suggestions == ["test search", "testing", "test results"]

    @pytest.mark.asyncio
    async def test_extra_params(
        self,
        mock_httpx_client: AsyncMock,
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {"organic": []}

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        await client.search("test", extra_params={"site": "example.com"})

        call_kwargs = mock_httpx_client.post.call_args[1]
        assert call_kwargs["json"]["site"] == "example.com"

    @pytest.mark.asyncio
    async def test_context_manager(
        self,
        mock_httpx_client: AsyncMock,
    ) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {"organic": []}

        mock_httpx_client.post.return_value = mock_response

        async with SerperClient(api_key="test-key", client=mock_httpx_client) as client:
            result = await client.search("test")
            assert result is not None

        # owned=False이므로 aclose가 호출되지 않음 (외부 client)
        mock_httpx_client.aclose.assert_not_called()


# ── 에러 처리 테스트 ──────────────────────────────────────────


class TestSerperClientErrors:
    @pytest.mark.asyncio
    async def test_auth_error(self, mock_httpx_client: AsyncMock) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = False
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_response.json.return_value = {"message": "Invalid API key"}

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="invalid-key", client=mock_httpx_client)
        with pytest.raises(SerperAuthError) as exc_info:
            await client.search("test")
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rate_limit_error(self, mock_httpx_client: AsyncMock) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = False
        mock_response.status_code = 429
        mock_response.text = "Rate limit exceeded"
        mock_response.json.return_value = {"message": "Too many requests"}

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        with pytest.raises(SerperRateLimitError) as exc_info:
            await client.search("test")
        assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_bad_request_error(self, mock_httpx_client: AsyncMock) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = False
        mock_response.status_code = 400
        mock_response.text = "Bad request"
        mock_response.json.return_value = {"message": "Missing query parameter"}

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        with pytest.raises(SerperBadRequestError) as exc_info:
            await client.search("")
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_timeout_retry(self, mock_httpx_client: AsyncMock) -> None:
        mock_httpx_client.post.side_effect = httpx.TimeoutException("timeout")

        client = SerperClient(
            api_key="test-key",
            client=mock_httpx_client,
            max_retries=1,
        )
        with pytest.raises(SerperError, match="최대 재시도 횟수 초과"):
            await client.search("test")

        assert mock_httpx_client.post.call_count == 2  # 1 initial + 1 retry

    @pytest.mark.asyncio
    async def test_http_error_retry(self, mock_httpx_client: AsyncMock) -> None:
        mock_httpx_client.post.side_effect = httpx.HTTPError("connection error")

        client = SerperClient(
            api_key="test-key",
            client=mock_httpx_client,
            max_retries=1,
        )
        with pytest.raises(SerperError, match="최대 재시도 횟수 초과"):
            await client.search("test")

        assert mock_httpx_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_server_error(self, mock_httpx_client: AsyncMock) -> None:
        mock_response = AsyncMock(spec=httpx.Response)
        mock_response.is_success = False
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_response.json.side_effect = ValueError("No JSON")

        mock_httpx_client.post.return_value = mock_response

        client = SerperClient(api_key="test-key", client=mock_httpx_client)
        with pytest.raises(SerperError) as exc_info:
            await client.search("test")
        assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    async def test_no_api_key(self) -> None:
        with (
            patch.dict("os.environ", clear=True),
            pytest.raises(SerperError, match="SERPER_API_KEY"),
        ):
            client = SerperClient()
            _ = client.api_key

    @pytest.mark.asyncio
    async def test_api_key_from_env(self) -> None:
        with patch.dict("os.environ", {"SERPER_API_KEY": "env-key"}):
            client = SerperClient()
            assert client.api_key == "env-key"
