"""Multi-country Nemotron Personas registry."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.config import PARQUET_PATH, PERSONAS_DATA_DIR, PROJECT_ROOT


DEFAULT_COUNTRY_ID = "kr"


@dataclass(frozen=True)
class PersonaDataset:
    country_id: str
    country_name: str
    country_name_ko: str
    hf_id: str
    language: str
    language_instruction: str
    nationality_phrase_ko: str
    nationality_phrase_en: str
    filename: str = "nemotron_personas.parquet"
    # Geo: map TargetFilter province/district to actual columns
    region_l1_field: str = "province"
    region_l2_field: str = "district"
    # Sex filter value aliases used by exclude / filters when Korean UI values are sent
    sex_male: str = "남자"
    sex_female: str = "여자"
    unemployed_values: tuple[str, ...] = ("무직",)
    supports_region_filter: bool = True
    supports_korea_map: bool = False
    notes: str = ""

    def resolved_path(self, data_dir: Path | None = None) -> Path:
        root = data_dir or PERSONAS_DATA_DIR
        primary = root / self.country_id / self.filename
        if primary.exists():
            return primary
        # Legacy single-file layout for Korea
        if self.country_id == DEFAULT_COUNTRY_ID and PARQUET_PATH.exists():
            return PARQUET_PATH
        legacy = PROJECT_ROOT / "data" / "nemotron_korea_personas.parquet"
        if self.country_id == DEFAULT_COUNTRY_ID and legacy.exists():
            return legacy
        return primary

    def is_available(self, data_dir: Path | None = None) -> bool:
        path = self.resolved_path(data_dir)
        return path.exists() and path.is_file()

    def public_dict(self, data_dir: Path | None = None) -> dict[str, Any]:
        path = self.resolved_path(data_dir)
        available = path.exists() and path.is_file()
        return {
            "country_id": self.country_id,
            "country_name": self.country_name,
            "country_name_ko": self.country_name_ko,
            "hf_id": self.hf_id,
            "language": self.language,
            "supports_region_filter": self.supports_region_filter,
            "supports_korea_map": self.supports_korea_map,
            "available": available,
            "path": str(path),
            "size_bytes": path.stat().st_size if available else None,
            "notes": self.notes,
        }


PERSONA_DATASETS: dict[str, PersonaDataset] = {
    "kr": PersonaDataset(
        country_id="kr",
        country_name="South Korea",
        country_name_ko="대한민국",
        hf_id="nvidia/Nemotron-Personas-Korea",
        language="Korean",
        language_instruction="한국어로 자연스럽게 답변하세요.",
        nationality_phrase_ko="한국인",
        nationality_phrase_en="a person from South Korea",
        region_l1_field="province",
        region_l2_field="district",
        sex_male="남자",
        sex_female="여자",
        unemployed_values=("무직",),
        supports_region_filter=True,
        supports_korea_map=True,
        notes="1M records / ~7M marketing personas",
    ),
    "us": PersonaDataset(
        country_id="us",
        country_name="United States",
        country_name_ko="미국",
        hf_id="nvidia/Nemotron-Personas-USA",
        language="American English",
        language_instruction="Respond naturally in American English.",
        nationality_phrase_ko="미국인",
        nationality_phrase_en="a person from the United States",
        region_l1_field="state",
        region_l2_field="city",
        sex_male="Male",
        sex_female="Female",
        unemployed_values=("not_in_workforce", "no_occupation", "unemployed"),
        supports_region_filter=False,
        notes="1M HF rows / ~6M marketing personas",
    ),
    "jp": PersonaDataset(
        country_id="jp",
        country_name="Japan",
        country_name_ko="일본",
        hf_id="nvidia/Nemotron-Personas-Japan",
        language="Japanese",
        language_instruction="日本語で自然に答えてください。",
        nationality_phrase_ko="일본인",
        nationality_phrase_en="a person from Japan",
        region_l1_field="prefecture",
        region_l2_field="area",
        sex_male="男性",
        sex_female="女性",
        unemployed_values=("無職", "not_in_workforce", "unemployed"),
        supports_region_filter=False,
        notes="1M HF rows / ~6M marketing personas; columns include prefecture/area/region",
    ),
    "in": PersonaDataset(
        country_id="in",
        country_name="India",
        country_name_ko="인도",
        hf_id="nvidia/Nemotron-Personas-India",
        language="Hindi (Devanagari + Latin), Indian English",
        language_instruction="Respond naturally in Indian English or Hindi as fits the persona.",
        nationality_phrase_ko="인도인",
        nationality_phrase_en="a person from India",
        region_l1_field="state",
        region_l2_field="district",
        sex_male="Male",
        sex_female="Female",
        unemployed_values=("not_in_workforce", "unemployed", "no_occupation"),
        supports_region_filter=False,
        notes="3 language splits concatenated (en_IN, hi_Deva_IN, hi_Latn_IN) = 3M rows",
    ),
    "br": PersonaDataset(
        country_id="br",
        country_name="Brazil",
        country_name_ko="브라질",
        hf_id="nvidia/Nemotron-Personas-Brazil",
        language="Brazilian Portuguese",
        language_instruction="Responda naturalmente em português brasileiro.",
        nationality_phrase_ko="브라질인",
        nationality_phrase_en="a person from Brazil",
        region_l1_field="state",
        region_l2_field="municipality",
        sex_male="Masculino",
        sex_female="Feminino",
        unemployed_values=("desempregado", "not_in_workforce", "unemployed"),
        supports_region_filter=False,
    ),
    "fr": PersonaDataset(
        country_id="fr",
        country_name="France",
        country_name_ko="프랑스",
        hf_id="nvidia/Nemotron-Personas-France",
        language="French",
        language_instruction="Répondez naturellement en français.",
        nationality_phrase_ko="프랑스인",
        nationality_phrase_en="a person from France",
        region_l1_field="departement",
        region_l2_field="commune",
        sex_male="Homme",
        sex_female="Femme",
        unemployed_values=("sans_emploi", "not_in_workforce", "unemployed"),
        supports_region_filter=False,
    ),
    "sg": PersonaDataset(
        country_id="sg",
        country_name="Singapore",
        country_name_ko="싱가포르",
        hf_id="nvidia/Nemotron-Personas-Singapore",
        language="English",
        language_instruction="Respond naturally in English.",
        nationality_phrase_ko="싱가포르인",
        nationality_phrase_en="a person from Singapore",
        region_l1_field="planning_area",
        region_l2_field="municipality",
        sex_male="Male",
        sex_female="Female",
        unemployed_values=("not_in_workforce", "unemployed", "no_occupation"),
        supports_region_filter=False,
        notes="148k rows; planning_area is primary geography",
    ),
    "vn": PersonaDataset(
        country_id="vn",
        country_name="Vietnam",
        country_name_ko="베트남",
        hf_id="nvidia/Nemotron-Personas-Vietnam",
        language="Vietnamese",
        language_instruction="Hãy trả lời một cách tự nhiên bằng tiếng Việt.",
        nationality_phrase_ko="베트남인",
        nationality_phrase_en="a person from Vietnam",
        region_l1_field="region",
        region_l2_field="zone",
        sex_male="Nam",
        sex_female="Nữ",
        unemployed_values=("thất nghiệp", "not_in_workforce", "unemployed"),
        supports_region_filter=False,
        notes="100k HF rows",
    ),
    "sv": PersonaDataset(
        country_id="sv",
        country_name="El Salvador",
        country_name_ko="엘살바도르",
        hf_id="nvidia/Nemotron-Personas-El-Salvador",
        language="Salvadoran Spanish",
        language_instruction="Responde de forma natural en español salvadoreño.",
        nationality_phrase_ko="엘살바도르인",
        nationality_phrase_en="a person from El Salvador",
        region_l1_field="department",
        region_l2_field="municipality",
        sex_male="Masculino",
        sex_female="Femenino",
        unemployed_values=("desempleado", "not_in_workforce", "unemployed"),
        supports_region_filter=False,
    ),
    "be": PersonaDataset(
        country_id="be",
        country_name="Belgium",
        country_name_ko="벨기에",
        hf_id="nvidia/Nemotron-Personas-Belgium",
        language="Multilingual (Dutch, French, German, English)",
        language_instruction="Respond naturally in the language that fits the persona.",
        nationality_phrase_ko="벨기에인",
        nationality_phrase_en="a person from Belgium",
        region_l1_field="region",
        region_l2_field="municipality",
        sex_male="Male",
        sex_female="Female",
        unemployed_values=("not_in_workforce", "unemployed", "no_occupation"),
        supports_region_filter=False,
        notes="4 language splits concatenated (nl/fr/de/en_BE) = 1.2M rows",
    ),
}


def list_datasets() -> list[PersonaDataset]:
    return list(PERSONA_DATASETS.values())


def get_dataset(country_id: str | None) -> PersonaDataset:
    key = (country_id or DEFAULT_COUNTRY_ID).strip().lower()
    if key not in PERSONA_DATASETS:
        supported = ", ".join(sorted(PERSONA_DATASETS))
        raise ValueError(f"Unsupported country_id '{country_id}'. Supported: {supported}")
    return PERSONA_DATASETS[key]


def normalize_country_id(country_id: str | None) -> str:
    return get_dataset(country_id).country_id


def available_countries(data_dir: Path | None = None) -> list[dict[str, Any]]:
    return [dataset.public_dict(data_dir) for dataset in list_datasets()]


# Common region field candidates across Nemotron country datasets
_REGION_L1_CANDIDATES = (
    "province",
    "state",
    "prefecture",
    "region",
    "department",
    "departement",
    "planning_area",
    "zone",
)
_REGION_L2_CANDIDATES = (
    "district",
    "city",
    "area",
    "municipality",
    "commune",
    "planning_area",
    "county",
    "ward",
    "zone",
)


def _first_present(row: dict[str, Any], candidates: tuple[str, ...]) -> Any:
    for key in candidates:
        value = row.get(key)
        if value is not None and value != "":
            return value
    return None


def normalize_persona_row(row: dict[str, Any], dataset: PersonaDataset) -> dict[str, Any]:
    """Map country-specific columns onto the Korea-shaped keys the engine expects."""
    from src.data.persona_display import extract_persona_name

    normalized = dict(row)

    l1 = row.get(dataset.region_l1_field)
    if l1 is None:
        l1 = _first_present(row, _REGION_L1_CANDIDATES)
    l2 = row.get(dataset.region_l2_field)
    if l2 is None:
        l2 = _first_present(row, _REGION_L2_CANDIDATES)

    if l1 is not None:
        normalized["province"] = l1
    if l2 is not None:
        normalized["district"] = l2

    # Ensure core narrative fields exist even if optional on some datasets
    if not normalized.get("persona"):
        for key in ("professional_persona", "cultural_background"):
            if row.get(key):
                normalized["persona"] = row[key]
                break

    normalized["_country_id"] = dataset.country_id
    normalized["_country_name"] = dataset.country_name
    normalized["_language"] = dataset.language
    if not normalized.get("country"):
        normalized["country"] = dataset.country_name

    # Attach a display name so UI/follow-up never falls back to KR-only pools for non-KR.
    if not normalized.get("name"):
        found = extract_persona_name(normalized)
        if found:
            normalized["name"] = found
    return normalized
