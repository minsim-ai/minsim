from pathlib import Path

import pytest

from src.agent.prompt_builder import build_system_prompt
from src.api.schemas import RunCreateRequest, SimulationType
from src.data.datasets import get_dataset, list_datasets, normalize_country_id, normalize_persona_row
from src.data.sampler import PersonaSampler


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "personas"


def test_registry_has_ten_countries() -> None:
    ids = {dataset.country_id for dataset in list_datasets()}
    assert ids == {"kr", "us", "jp", "in", "br", "fr", "sg", "vn", "sv", "be"}


def test_normalize_country_id_defaults_and_rejects() -> None:
    assert normalize_country_id(None) == "kr"
    assert normalize_country_id("US") == "us"
    with pytest.raises(ValueError):
        normalize_country_id("xx")


def test_normalize_persona_row_maps_us_geo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PERSONAS_DATA_DIR", str(FIXTURE_ROOT))
    from src import config

    monkeypatch.setattr(config, "PERSONAS_DATA_DIR", FIXTURE_ROOT)
    dataset = get_dataset("us")
    row = {
        "uuid": "us-1",
        "age": 30,
        "sex": "Female",
        "state": "CA",
        "city": "San Jose",
        "occupation": "engineer",
        "persona": "hello",
    }
    normalized = normalize_persona_row(row, dataset)
    assert normalized["province"] == "CA"
    assert normalized["district"] == "San Jose"
    assert normalized["_country_id"] == "us"


def test_sampler_reads_country_specific_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("src.data.datasets.PERSONAS_DATA_DIR", FIXTURE_ROOT)
    monkeypatch.setattr("src.config.PERSONAS_DATA_DIR", FIXTURE_ROOT)

    us = PersonaSampler(country_id="us")
    rows = us.sample(n=5, seed=1)
    assert len(rows) == 5
    assert all(row["_country_id"] == "us" for row in rows)
    assert all(row.get("province") for row in rows)

    kr = PersonaSampler(country_id="kr")
    filtered = kr.sample(n=3, filter_={"province": ["서울"]}, seed=2)
    assert len(filtered) == 3
    assert all(row["province"] == "서울" for row in filtered)


def test_prompt_builder_language_by_country() -> None:
    kr_prompt = build_system_prompt(
        {
            "uuid": "1",
            "age": 30,
            "sex": "여자",
            "province": "서울",
            "district": "강남구",
            "occupation": "디자이너",
            "education_level": "4년제",
            "persona": "테스트",
            "_country_id": "kr",
        }
    )
    assert "한국인" in kr_prompt

    us_prompt = build_system_prompt(
        {
            "uuid": "2",
            "age": 28,
            "sex": "Male",
            "province": "CA",
            "district": "SF",
            "occupation": "engineer",
            "education_level": "bachelors",
            "persona": "test",
            "_country_id": "us",
        }
    )
    assert "United States" in us_prompt
    assert "American English" in us_prompt or "English" in us_prompt


def test_run_create_request_accepts_country_id() -> None:
    request = RunCreateRequest(
        simulation_type=SimulationType.CREATIVE_TESTING,
        input={"creatives": ["A 문구", "B 문구"]},
        sample_size=10,
        country_id="jp",
    )
    assert request.country_id == "jp"
