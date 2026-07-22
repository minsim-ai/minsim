import pytest

from src.data.campus_tiers import TIER_ORDER, classify_tier
from src.data.sampler import PersonaSampler
from src.data.stratified import DEFAULT_TIER_MINIMUMS, sample_stratified


@pytest.fixture
def sampler():
    return PersonaSampler(pool="dgist")


def test_every_tier_meets_minimum(sampler):
    result = sample_stratified(sampler, n=200, seed=42)
    counts = result.meta["tier_counts"]
    for tier in TIER_ORDER:
        assert counts[tier] >= DEFAULT_TIER_MINIMUMS[tier], f"{tier} 미달: {counts[tier]}"


def test_total_matches_requested_size(sampler):
    result = sample_stratified(sampler, n=200, seed=42)
    assert len(result.personas) == 200
    assert sum(result.meta["tier_counts"].values()) == 200


def test_weights_restore_population_ratio(sampler):
    """역가중을 적용하면 계층 가중합이 모집단 비율을 복원해야 한다."""
    result = sample_stratified(sampler, n=200, seed=42)
    weights = result.meta["tier_weights"]
    counts = result.meta["tier_counts"]
    weighted_total = sum(counts[tier] * weights[tier] for tier in TIER_ORDER)
    assert weighted_total == pytest.approx(200, rel=0.02)
    # 과대표집된 계층(박사후연구원은 모집단 111명뿐)의 가중치는 1보다 작아야 한다
    assert weights["박사후연구원"] < 1.0


def test_small_sample_scales_minimums_down_with_warning(sampler):
    """요청 표본이 최소치 합보다 작으면 오류가 아니라 축소 + 경고."""
    result = sample_stratified(sampler, n=20, seed=42)
    assert len(result.personas) == 20
    assert any("최소 표본" in warning for warning in result.meta["warnings"])


def test_seed_is_reproducible(sampler):
    a = sample_stratified(sampler, n=100, seed=7)
    b = sample_stratified(sampler, n=100, seed=7)
    assert [p["uuid"] for p in a.personas] == [p["uuid"] for p in b.personas]


def test_meta_declares_stratified(sampler):
    result = sample_stratified(sampler, n=100, seed=42)
    assert result.meta["sampling"] == "stratified"


def test_tiers_are_actually_represented(sampler):
    result = sample_stratified(sampler, n=200, seed=42)
    observed = {classify_tier(persona) for persona in result.personas}
    assert observed == set(TIER_ORDER)
