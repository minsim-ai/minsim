"""Serper API 요청/응답 Pydantic 모델."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SearchType(str, Enum):
    """Serper.dev가 지원하는 검색 타입 13종."""

    SEARCH = "search"
    IMAGES = "images"
    VIDEOS = "videos"
    PLACES = "places"
    MAPS = "maps"
    REVIEWS = "reviews"
    NEWS = "news"
    SHOPPING = "shopping"
    LENS = "image search (lens)"
    SCHOLAR = "scholar"
    PATENTS = "patents"
    AUTOCOMPLETE = "autocomplete"
    WEBPAGE = "webpage"


# ── 엔드포인트 URL 매핑 ──────────────────────────────────────
_SEARCH_TYPE_ENDPOINTS: dict[SearchType, str] = {
    SearchType.SEARCH: "https://google.serper.dev/search",
    SearchType.IMAGES: "https://google.serper.dev/images",
    SearchType.VIDEOS: "https://google.serper.dev/videos",
    SearchType.PLACES: "https://google.serper.dev/places",
    SearchType.MAPS: "https://google.serper.dev/maps",
    SearchType.REVIEWS: "https://google.serper.dev/reviews",
    SearchType.NEWS: "https://google.serper.dev/news",
    SearchType.SHOPPING: "https://google.serper.dev/shopping",
    SearchType.LENS: "https://google.serper.dev/images",
    SearchType.SCHOLAR: "https://google.serper.dev/scholar",
    SearchType.PATENTS: "https://google.serper.dev/patents",
    SearchType.AUTOCOMPLETE: "https://google.serper.dev/autocomplete",
    SearchType.WEBPAGE: "https://google.serper.dev/webpage",
}


def endpoint_for(search_type: SearchType) -> str:
    """검색 타입에 대응하는 Serper API 엔드포인트 URL 반환."""
    return _SEARCH_TYPE_ENDPOINTS[search_type]


# ── 공통 응답 모델 ──────────────────────────────────────────────


class OrganicResult(BaseModel):
    """일반 검색 결과 항목."""

    title: str = ""
    link: str = ""
    snippet: str = ""
    position: int = 0
    sitelinks: list[dict[str, str]] | None = None
    attributes: dict[str, str] | None = None
    date: str | None = None


class KnowledgeGraph(BaseModel):
    """지식 그래프 정보 (있을 때만)."""

    title: str = ""
    type: str = ""
    website: str = ""
    imageUrl: str = ""
    description: str = ""
    descriptionSource: str = ""
    descriptionLink: str = ""
    attributes: dict[str, str] | None = None


class AnswerBox(BaseModel):
    """답변 박스 (featured snippet)."""

    title: str = ""
    link: str = ""
    snippet: str = ""
    date: str | None = None
    imageUrl: str | None = None


class PeopleAlsoAsk(BaseModel):
    """다른 사람들은 이렇게 질문."""

    question: str = ""
    snippet: str = ""
    title: str = ""
    link: str = ""


class RelatedSearch(BaseModel):
    """관련 검색어."""

    query: str = ""


# ── 타입별 결과 항목 모델 ───────────────────────────────────


class ImageResultItem(BaseModel):
    """이미지 검색 결과 항목."""

    title: str = ""
    imageUrl: str = ""
    link: str = ""
    source: str = ""
    height: int | None = None
    width: int | None = None


class VideoResultItem(BaseModel):
    """동영상 검색 결과 항목."""

    title: str = ""
    link: str = ""
    snippet: str = ""
    channel: str = ""
    date: str | None = None
    duration: str | None = None
    imageUrl: str | None = None
    views: int | None = None


class NewsResultItem(BaseModel):
    """뉴스 검색 결과 항목."""

    title: str = ""
    link: str = ""
    snippet: str = ""
    source: str = ""
    date: str | None = None
    imageUrl: str | None = None


class ScholarResultItem(BaseModel):
    """학술 검색 결과 항목."""

    title: str = ""
    link: str = ""
    snippet: str = ""
    publicationInfo: str = ""
    authors: str = ""
    citationCount: int | None = None
    pdfLink: str | None = None


class ShoppingResultItem(BaseModel):
    """쇼핑 검색 결과 항목."""

    title: str = ""
    link: str = ""
    price: str = ""
    source: str = ""
    imageUrl: str | None = None
    rating: float | None = None
    reviews: int | None = None
    delivery: str | None = None


class AutocompleteResultItem(BaseModel):
    """자동완성 제안."""

    suggestion: str = ""


class PlaceResultItem(BaseModel):
    """places/maps 타입 결과 항목."""

    title: str = ""
    address: str = ""
    phone: str | None = None
    website: str | None = None
    rating: float | None = None
    reviews: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    hours: str | None = None
    type: str | None = None


class PatentResultItem(BaseModel):
    """patents 타입 결과 항목."""

    title: str = ""
    link: str = ""
    snippet: str = ""
    patentId: str = ""
    inventor: str = ""
    assignee: str = ""
    filingDate: str | None = None
    publicationDate: str | None = None


# ── 타입별 응답 모델 ──────────────────────────────────────────


class SearchResult(BaseModel):
    """search 타입 응답."""

    organic: list[OrganicResult] = Field(default_factory=list)
    knowledgeGraph: KnowledgeGraph | None = None
    answerBox: AnswerBox | None = None
    peopleAlsoAsk: list[PeopleAlsoAsk] = Field(default_factory=list)
    relatedSearches: list[RelatedSearch] = Field(default_factory=list)
    topStories: list[dict[str, Any]] | None = None


class ImageResult(BaseModel):
    """images 타입 응답."""

    images: list[ImageResultItem] = Field(default_factory=list)


class VideoResult(BaseModel):
    """videos 타입 응답."""

    videos: list[VideoResultItem] = Field(default_factory=list)


class NewsResult(BaseModel):
    """news 타입 응답."""

    news: list[NewsResultItem] = Field(default_factory=list)
    topStories: list[dict[str, Any]] | None = None


class ScholarResult(BaseModel):
    """scholar 타입 응답."""

    organic: list[ScholarResultItem] = Field(default_factory=list)


class ShoppingResult(BaseModel):
    """shopping 타입 응답."""

    shopping: list[ShoppingResultItem] = Field(default_factory=list)


class AutocompleteResult(BaseModel):
    """autocomplete 타입 응답."""

    suggestions: list[str] = Field(default_factory=list)


class PlaceResult(BaseModel):
    """places 타입 응답."""

    places: list[PlaceResultItem] = Field(default_factory=list)


class MapResult(BaseModel):
    """maps 타입 응답."""

    places: list[PlaceResultItem] = Field(default_factory=list)


class ReviewResult(BaseModel):
    """reviews 타입 응답."""

    reviews: list[dict[str, Any]] = Field(default_factory=list)


class PatentResult(BaseModel):
    """patents 타입 응답."""

    patents: list[PatentResultItem] = Field(default_factory=list)


class WebpageResult(BaseModel):
    """webpage (크롤링) 타입 응답."""

    url: str = ""
    title: str = ""
    description: str = ""
    content: str = ""
    images: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    timestamp: datetime | None = None


# ── 통합 응답 (raw JSON 파싱용) ────────────────────────────


class SerperResponse(BaseModel):
    """모든 검색 타입을 포괄하는 통합 응답.

    실제 응답은 검색 타입에 따라 일부 필드만 채워집니다.
    raw 필드에 원본 JSON을 보존합니다.
    """

    searchParameters: dict[str, Any] = Field(default_factory=dict)

    # 공통
    organic: list[OrganicResult] = Field(default_factory=list)
    knowledgeGraph: KnowledgeGraph | None = None
    answerBox: AnswerBox | None = None
    peopleAlsoAsk: list[PeopleAlsoAsk] = Field(default_factory=list)
    relatedSearches: list[RelatedSearch] = Field(default_factory=list)

    # images
    images: list[ImageResultItem] = Field(default_factory=list)

    # videos
    videos: list[VideoResultItem] = Field(default_factory=list)

    # news
    news: list[NewsResultItem] = Field(default_factory=list)
    topStories: list[dict[str, Any]] | None = None

    # shopping
    shopping: list[ShoppingResultItem] = Field(default_factory=list)

    # autocomplete
    suggestions: list[str] = Field(default_factory=list)

    # places / maps
    places: list[PlaceResultItem] = Field(default_factory=list)

    # reviews
    reviews: list[dict[str, Any]] = Field(default_factory=list)

    # patents
    patents: list[PatentResultItem] = Field(default_factory=list)

    # webpage
    url: str = ""
    content: str = ""
    webpage_images: list[str] = Field(default_factory=list)
    webpage_videos: list[str] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    timestamp: datetime | None = None

    # raw JSON 보존
    raw: dict[str, Any] | None = None

    model_config = {"extra": "allow"}
