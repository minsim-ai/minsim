"""C-4: Serper market grounding for autofill — optional and failure-proof."""
import pytest

import src.services.autofill_service as autofill_service
from src.services.autofill_service import build_autofill_messages, gather_market_context


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_market_context_disabled_without_key(monkeypatch) -> None:
    monkeypatch.setattr(autofill_service, "WEB_SEARCH_ENABLED", False)
    assert await gather_market_context("뇌파 수면 머리띠") is None


@pytest.mark.anyio
async def test_market_context_collects_snippets(monkeypatch) -> None:
    class _Item:
        def __init__(self, title: str, snippet: str) -> None:
            self.title = title
            self.snippet = snippet

    class _Response:
        organic = [
            _Item("수면 밴드 가격", "수면 밴드는 12~15만원대가 주류입니다."),
            _Item("경쟁 제품", "멜라토닌 보조제와 수면 앱이 대안입니다."),
            _Item("빈 스니펫", ""),
        ]

    class _FakeSerperClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def search(self, query: str, **kwargs):
            assert "가격" in query
            return _Response()

    import src.serper as serper_module

    monkeypatch.setattr(autofill_service, "WEB_SEARCH_ENABLED", True)
    monkeypatch.setattr(serper_module, "SerperClient", _FakeSerperClient)

    context = await gather_market_context("뇌파 수면 머리띠")

    assert context is not None
    assert "12~15만원대" in context
    assert "빈 스니펫" not in context


@pytest.mark.anyio
async def test_market_context_swallows_search_failures(monkeypatch) -> None:
    class _BrokenSerperClient:
        async def __aenter__(self):
            raise RuntimeError("serper down")

        async def __aexit__(self, *args: object) -> None:
            return None

    import src.serper as serper_module

    monkeypatch.setattr(autofill_service, "WEB_SEARCH_ENABLED", True)
    monkeypatch.setattr(serper_module, "SerperClient", _BrokenSerperClient)

    assert await gather_market_context("뇌파 수면 머리띠") is None


def test_autofill_messages_include_market_context() -> None:
    without = build_autofill_messages("뇌파 수면 머리띠", None)
    assert "웹 검색 결과" not in without[0].content

    with_context = build_autofill_messages(
        "뇌파 수면 머리띠", None, market_context="- 수면 밴드: 12~15만원대"
    )
    assert "실제 웹 검색 결과(참고용)" in with_context[0].content
    assert "12~15만원대" in with_context[0].content


def test_autofill_messages_include_current_fields_as_context() -> None:
    from src.api.schemas import ProjectAutofillCurrentFields

    plain = build_autofill_messages("카풀이 더 합리적일까?", None, kind="poll")
    assert plain[1].content == "아이디어: 카풀이 더 합리적일까?"
    assert "현재 초안 필드" not in plain[0].content

    with_fields = build_autofill_messages(
        "2~3명 동승 택시가 혼자 타는 것보다 합리적이다",
        None,
        kind="poll",
        current_fields=ProjectAutofillCurrentFields(
            name="DGIST 카풀 택시 합리화",
            description="늦을 때 택시 동승 여론",
            product_context="학내 카풀 배경",
            target_notes="학부생 위주",
            features=[],
            prices=[],
            alternatives=[],
        ),
    )
    assert "현재 초안 필드가 함께 제공" in with_fields[0].content
    assert "현재 초안 필드(화면 값, 참고·유지 대상)" in with_fields[1].content
    assert "DGIST 카풀 택시 합리화" in with_fields[1].content
    assert "학내 카풀 배경" in with_fields[1].content
    assert "학부생 위주" in with_fields[1].content
