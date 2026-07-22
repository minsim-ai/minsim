"""Serper.dev Google Search API 모듈.

13종의 검색 타입을 지원하는 비동기 Web Search 클라이언트.
사용법::

    from src.serper import SerperClient, SearchType

    async with SerperClient() as client:
        result = await client.search("한국 관광", search_type=SearchType.SEARCH)
        print(result.organic[0].title)
"""

from src.serper.client import SerperClient
from src.serper.models import (
    AutocompleteResult,
    ImageResult,
    NewsResult,
    ScholarResult,
    SearchResult,
    SearchType,
    SerperResponse,
    ShoppingResult,
    VideoResult,
)

__all__ = [
    "SerperClient",
    "SearchType",
    "SerperResponse",
    "SearchResult",
    "ImageResult",
    "VideoResult",
    "NewsResult",
    "ScholarResult",
    "ShoppingResult",
    "AutocompleteResult",
]
