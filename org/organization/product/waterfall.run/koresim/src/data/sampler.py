"""페르소나 필터링 + 샘플링"""
from typing import Optional, TypedDict

import polars as pl

from src.data.loader import ParquetLoader


class TargetFilter(TypedDict, total=False):
    province: list[str]
    district: list[str]  # 시군구 정확 매칭. 예: ["서울-강남구", "부산-해운대구"]
    age_min: int
    age_max: int
    sex: str
    education_level: list[str]
    occupation_keywords: list[str]
    exclude_unemployed: bool


class PersonaSampler:
    def __init__(self) -> None:
        self.loader = ParquetLoader()

    def sample(
        self,
        n: int,
        filter_: Optional[TargetFilter] = None,
        seed: int = 42,
    ) -> list[dict]:
        lf = self.loader.scan()
        f = filter_ or {}

        if provinces := f.get("province"):
            lf = lf.filter(pl.col("province").is_in(provinces))
        if districts := f.get("district"):
            lf = lf.filter(pl.col("district").is_in(districts))
        if (age_min := f.get("age_min")) is not None:
            lf = lf.filter(pl.col("age") >= age_min)
        if (age_max := f.get("age_max")) is not None:
            lf = lf.filter(pl.col("age") <= age_max)
        if sex := f.get("sex"):
            lf = lf.filter(pl.col("sex") == sex)
        if education := f.get("education_level"):
            lf = lf.filter(pl.col("education_level").is_in(education))
        if f.get("exclude_unemployed"):
            lf = lf.filter(pl.col("occupation") != "무직")
        if keywords := f.get("occupation_keywords"):
            expr = pl.col("occupation").str.contains(keywords[0])
            for kw in keywords[1:]:
                expr = expr | pl.col("occupation").str.contains(kw)
            lf = lf.filter(expr)

        df = lf.collect()
        if df.height == 0:
            raise ValueError("필터 조건에 해당하는 페르소나가 없습니다")

        actual_n = min(n, df.height)
        sampled = df.sample(n=actual_n, seed=seed)
        return sampled.to_dicts()

    def list_districts(self, provinces: Optional[list[str]] = None) -> list[str]:
        """광역시도 선택 시 해당 시군구 목록 반환. provinces가 None이면 전체 252개."""
        lf = self.loader.scan()
        if provinces:
            lf = lf.filter(pl.col("province").is_in(provinces))
        return sorted(lf.select("district").unique().collect().to_series().to_list())
