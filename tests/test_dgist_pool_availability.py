"""워크트리 부트스트랩이 끝나면 DGIST 풀이 실제로 쓸 수 있어야 한다."""
from src.data.pools import pool_metadata
from src.data.sampler import PersonaSampler


def test_dgist_pool_is_available_when_parquet_linked():
    meta = {item["id"]: item for item in pool_metadata()}
    assert meta["dgist"]["available"] is True


def test_dgist_pool_samples_real_personas():
    rows = PersonaSampler(pool="dgist").sample(5, seed=42)
    assert len(rows) == 5
    assert all("DGIST" in row["occupation"] for row in rows)
