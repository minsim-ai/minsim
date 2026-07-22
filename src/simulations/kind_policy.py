"""프로젝트 갈래(kind)와 시뮬레이션·페르소나 풀의 허용 조합.

이 매핑은 원래 `frontend/src/modes/projectKinds.ts`에만 있었다. UI 라벨용 상수라
서버는 조합을 전혀 검증하지 않았고, 여론조사 프로젝트에서 창업 검증 시뮬레이션을
전국 페르소나로 실행해도 통과했다. REST와 MCP가 같은 서비스를 타므로 두 경로가
동시에 열려 있었다.

프론트엔드 목록을 바꿀 때 여기도 같이 바꾼다. 여기가 실제 게이트다.
"""
from __future__ import annotations

POLL_SIMULATIONS: frozenset[str] = frozenset(
    {
        "open_survey",
        "campus_policy",
        "campus_priority",
        "creative_testing",
        "price_optimization",
        "product_launch",
        "competitive_positioning",
        "brand_perception",
        "campaign_strategy",
        "market_segmentation",
        "churn_prediction",
        "value_proposition",
    }
)

VENTURE_SIMULATIONS: frozenset[str] = frozenset(
    {
        "open_survey",
        "startup_item_validation",
        "creative_testing",
        "price_optimization",
        "product_launch",
        "value_proposition",
        "market_segmentation",
        "competitive_positioning",
        "brand_perception",
        "churn_prediction",
        "campaign_strategy",
    }
)

_BY_KIND: dict[str, frozenset[str]] = {
    "poll": POLL_SIMULATIONS,
    "venture": VENTURE_SIMULATIONS,
}

DEFAULT_POOL_BY_KIND: dict[str, str] = {
    "poll": "dgist",
    "venture": "nationwide",
}

#: 여론조사는 DGIST 학내 대상이라 한국 페르소나만 의미가 있다.
ALLOWED_COUNTRIES_BY_KIND: dict[str, frozenset[str] | None] = {
    "poll": frozenset({"kr"}),
    "venture": None,
}


def _normalize(kind: str | None) -> str:
    value = (kind or "venture").strip().lower()
    return value if value in _BY_KIND else "venture"


def allowed_simulations(kind: str | None) -> frozenset[str]:
    return _BY_KIND[_normalize(kind)]


def default_persona_pool(kind: str | None) -> str:
    return DEFAULT_POOL_BY_KIND[_normalize(kind)]


def allows_simulation(kind: str | None, simulation_type: str) -> bool:
    return simulation_type in allowed_simulations(kind)


def allows_country(kind: str | None, country_id: str | None) -> bool:
    allowed = ALLOWED_COUNTRIES_BY_KIND[_normalize(kind)]
    if allowed is None:
        return True
    return (country_id or "kr").strip().lower() in allowed
