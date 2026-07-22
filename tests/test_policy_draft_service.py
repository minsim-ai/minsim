import json

import pytest

from src.llm.base import LLMResponse
from src.services.policy_draft_service import draft_policy_fields


class FakeClient:
    def __init__(self, payload):
        self.payload = payload
        self.prompts: list[str] = []

    async def generate(self, request) -> LLMResponse:
        self.prompts.append(request.messages[-1].content)
        return LLMResponse(
            content=json.dumps(self.payload, ensure_ascii=False),
            provider="fake",
            provider_model="stub",
        )


FULL_DRAFT = {
    "current_state": "평일 09-23시",
    "proposed_change": "1층만 24시간",
    "tradeoffs": "연 1.2억 증가",
}


@pytest.mark.asyncio
async def test_fills_all_three_fields():
    result = await draft_policy_fields("중앙도서관 24시간 개방", {}, FakeClient(FULL_DRAFT))
    assert set(result["fields"]) == {"current_state", "proposed_change", "tradeoffs"}
    assert set(result["ai_generated"]) == {"current_state", "proposed_change", "tradeoffs"}


@pytest.mark.asyncio
async def test_preserves_user_written_fields():
    """사용자가 직접 쓴 칸을 AI가 덮어쓰면 안 된다."""
    client = FakeClient({**FULL_DRAFT, "current_state": "AI가 지어낸 값"})
    result = await draft_policy_fields(
        "중앙도서관 24시간 개방", {"current_state": "사용자가 직접 쓴 값"}, client
    )
    assert result["fields"]["current_state"] == "사용자가 직접 쓴 값"
    assert "current_state" not in result["ai_generated"]


@pytest.mark.asyncio
async def test_prompt_demands_verifiable_current_state():
    client = FakeClient(FULL_DRAFT)
    await draft_policy_fields("중앙도서관 24시간 개방", {}, client)
    assert "확인이 필요" in client.prompts[0]


@pytest.mark.asyncio
async def test_returns_empty_strings_on_unparseable_response():
    class BrokenClient:
        async def generate(self, request) -> LLMResponse:
            return LLMResponse(content="죄송합니다", provider="fake", provider_model="stub")

    result = await draft_policy_fields("안건", {}, BrokenClient())
    assert result["fields"] == {"current_state": "", "proposed_change": "", "tradeoffs": ""}
    assert result["ai_generated"] == []


@pytest.mark.asyncio
async def test_taxonomy_returns_categories_and_valid_conflicts():
    from src.services.policy_draft_service import draft_condition_taxonomy

    client = FakeClient({
        "categories": ["학생 부담 없는 재원", "야간 안전 대책", "타 예산 삭감 허용", "시범 운영"],
        "conflicts": [["학생 부담 없는 재원", "타 예산 삭감 허용"]],
    })
    out = await draft_condition_taxonomy("도서관 24시간", "연 1.2억", client)
    assert len(out["categories"]) == 4
    assert out["conflicts"] == [["학생 부담 없는 재원", "타 예산 삭감 허용"]]


@pytest.mark.asyncio
async def test_taxonomy_drops_conflicts_naming_unknown_categories():
    """범주에 없는 이름을 상충 쌍으로 두면 영원히 발화하지 않는다."""
    from src.services.policy_draft_service import draft_condition_taxonomy

    client = FakeClient({"categories": ["재원"], "conflicts": [["재원", "존재하지 않는 범주"]]})
    out = await draft_condition_taxonomy("안건", "비용", client)
    assert out["conflicts"] == []


@pytest.mark.asyncio
async def test_taxonomy_caps_at_six_categories():
    from src.services.policy_draft_service import draft_condition_taxonomy

    client = FakeClient({"categories": [f"범주{i}" for i in range(10)], "conflicts": []})
    out = await draft_condition_taxonomy("안건", "비용", client)
    assert len(out["categories"]) == 6
