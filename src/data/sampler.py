"""페르소나 필터링 + 샘플링 (multi-country)."""
from typing import Optional, TypedDict

import polars as pl

from src.data.datasets import DEFAULT_COUNTRY_ID, get_dataset, normalize_persona_row
from src.data.loader import ParquetLoader
from src.data.pools import DEFAULT_PERSONA_POOL, resolve_pool


class TargetFilter(TypedDict, total=False):
    province: list[str]
    district: list[str]  # 시군구 정확 매칭. 예: ["서울-강남구", "부산-해운대구"]
    age_min: int
    age_max: int
    sex: str
    education_level: list[str]
    occupation_keywords: list[str]
    exclude_unemployed: bool


_SEX_ALIASES = {
    "남자": (
        "남자", "Male", "male", "M", "남성", "Masculino", "Homme", "Nam",
        "Man", "Mannelijk", "Mann", "Homme", "Masculin",
    ),
    "여자": (
        "여자", "Female", "female", "F", "여성", "Feminino", "Femenino", "Femme", "Nữ",
        "Vrouw", "Vrouwelijk", "Frau", "Féminin",
    ),
    "male": (
        "Male", "male", "남자", "남성", "Masculino", "Homme", "Nam",
        "Man", "Mannelijk", "Mann", "Masculin",
    ),
    "female": (
        "Female", "female", "여자", "여성", "Feminino", "Femenino", "Femme", "Nữ",
        "Vrouw", "Vrouwelijk", "Frau", "Féminin",
    ),
}


class PersonaSampler:
    def __init__(
        self,
        country_id: str | None = None,
        pool: str = DEFAULT_PERSONA_POOL,
        loader: ParquetLoader | None = None,
    ) -> None:
        self.dataset = get_dataset(country_id or DEFAULT_COUNTRY_ID)
        self.country_id = self.dataset.country_id
        # Persona pools (B-3, e.g. DGIST) are KR-scoped dataset overrides on
        # top of the multi-country registry.
        self.pool = pool if self.country_id == DEFAULT_COUNTRY_ID else DEFAULT_PERSONA_POOL
        if loader is not None:
            self.loader = loader
        elif self.pool != DEFAULT_PERSONA_POOL:
            self.loader = ParquetLoader(
                path=resolve_pool(self.pool).path, country_id=self.country_id
            )
        else:
            self.loader = ParquetLoader(country_id=self.country_id)

    def sample(
        self,
        n: int,
        filter_: Optional[TargetFilter] = None,
        seed: int = 42,
    ) -> list[dict]:
        lf = self.loader.scan()
        f = filter_ or {}
        schema_names = set(lf.collect_schema().names())

        # Region filters only when columns exist and country supports them (KR v1)
        if provinces := f.get("province"):
            region_field = self.dataset.region_l1_field
            if region_field in schema_names:
                lf = lf.filter(pl.col(region_field).is_in(provinces))
            elif "province" in schema_names:
                lf = lf.filter(pl.col("province").is_in(provinces))
        if districts := f.get("district"):
            region_field = self.dataset.region_l2_field
            if region_field in schema_names:
                lf = lf.filter(pl.col(region_field).is_in(districts))
            elif "district" in schema_names:
                lf = lf.filter(pl.col("district").is_in(districts))

        if (age_min := f.get("age_min")) is not None and "age" in schema_names:
            lf = lf.filter(pl.col("age") >= age_min)
        if (age_max := f.get("age_max")) is not None and "age" in schema_names:
            lf = lf.filter(pl.col("age") <= age_max)

        if sex := f.get("sex"):
            if "sex" in schema_names:
                aliases = list(_SEX_ALIASES.get(sex, (sex,)))
                # Also include dataset-native labels
                if sex in {"남자", "male", "Male", "남성"}:
                    aliases.append(self.dataset.sex_male)
                if sex in {"여자", "female", "Female", "여성"}:
                    aliases.append(self.dataset.sex_female)
                lf = lf.filter(pl.col("sex").is_in(list(dict.fromkeys(aliases))))

        if education := f.get("education_level"):
            if "education_level" in schema_names:
                lf = lf.filter(pl.col("education_level").is_in(education))

        if f.get("exclude_unemployed") and "occupation" in schema_names:
            unemployed = list(self.dataset.unemployed_values)
            lf = lf.filter(~pl.col("occupation").is_in(unemployed))

        if keywords := f.get("occupation_keywords"):
            if "occupation" in schema_names:
                expr = pl.col("occupation").str.contains(keywords[0])
                for kw in keywords[1:]:
                    expr = expr | pl.col("occupation").str.contains(kw)
                lf = lf.filter(expr)

        df = lf.collect()
        if df.height == 0:
            raise ValueError("필터 조건에 해당하는 페르소나가 없습니다")

        actual_n = min(n, df.height)
        sampled = df.sample(n=actual_n, seed=seed)
        return [
            normalize_persona_row(row, self.dataset) for row in sampled.to_dicts()
        ]

    def list_districts(self, provinces: Optional[list[str]] = None) -> list[str]:
        """광역시도 선택 시 해당 시군구 목록 반환. provinces가 None이면 전체."""
        lf = self.loader.scan()
        schema_names = set(lf.collect_schema().names())
        l1 = self.dataset.region_l1_field if self.dataset.region_l1_field in schema_names else "province"
        l2 = self.dataset.region_l2_field if self.dataset.region_l2_field in schema_names else "district"
        if l2 not in schema_names:
            return []
        if provinces and l1 in schema_names:
            lf = lf.filter(pl.col(l1).is_in(provinces))
        return sorted(lf.select(l2).unique().collect().to_series().to_list())
