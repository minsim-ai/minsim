"""Country-aware persona display helpers (name extraction, sex aliases)."""
from __future__ import annotations

import hashlib
import re
from typing import Any

_NAME_FIELDS = ("name", "persona_name", "full_name", "korean_name")
_NARRATIVE_FIELDS = (
    "persona",
    "professional_persona",
    "family_persona",
    "arts_persona",
    "cultural_background",
)

# 전기태 씨는 …
_KR_NAME = re.compile(r"^([가-힣]{2,4})\s*씨")

# 野本 花代子は、… / 杉浦 泰章は、…
_JP_NAME = re.compile(
    r"^([\u3040-\u30ff\u3400-\u9fff々〆ヶー\s]{2,20}?)"
    r"は(?:[、,]|\s|$)"
)

# Mary Alberti is … / Marcos Antunes é … / Nathalie Guillanton unit …
_LATIN_NAME = re.compile(
    r"^([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.\-]+"
    r"(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.\-]+){0,3})"
    r"(?=\s*[,，]"
    r"|\s+(?:is|was|has|fuses|channels|blends|combines|combina|"
    r"é|est|unit|allie|incarne|known|balances|prefers|finds|fuels|"
    r"showcases|aims)\b)",
)

# Betty is a … / Charmaine, a …
_LATIN_SINGLE = re.compile(
    r"^([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.\-]{1,24})"
    r"(?=\s*[,，]|\s+(?:is|was|has|é|est)\b)",
)

# Nguyễn Thị Hoa, …
_VN_NAME = re.compile(
    r"^([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ"
    r"ÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^\s,]{0,24}"
    r"(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ"
    r"ÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^\s,]{0,24}){1,4})\s*,",
)

# Spanish mid-sentence: …, Oseas Ortiz Ortiz, a sus 29…
_ES_MID_NAME = re.compile(
    r",\s*([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’.\-]+"
    r"(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’.\-]+){1,3}),\s*a\s+sus\b",
)

_NAME_BLOCKLIST = frozenset(
    {
        "a",
        "an",
        "at",
        "con",
        "da",
        "de",
        "des",
        "do",
        "el",
        "em",
        "en",
        "from",
        "in",
        "la",
        "le",
        "les",
        "na",
        "no",
        "on",
        "para",
        "por",
        "su",
        "the",
        "um",
        "uma",
        "un",
        "une",
        "with",
    }
)

_MALE_VALUES = frozenset(
    {
        "남자",
        "남성",
        "남",
        "male",
        "m",
        "man",
        "masculino",
        "masculin",
        "homme",
        "nam",
        "mann",
        "mannelijk",
        "男性",
        "男",
    }
)
_FEMALE_VALUES = frozenset(
    {
        "여자",
        "여성",
        "여",
        "female",
        "f",
        "woman",
        "feminino",
        "femenino",
        "féminin",
        "femme",
        "nữ",
        "vrouw",
        "vrouwelijk",
        "frau",
        "女性",
        "女",
    }
)

# Legacy KR synthetic pools — only for Korea when narrative has no name.
_NAMES_F = [
    "강순녀",
    "나순희",
    "장화영",
    "유복연",
    "안혜영",
    "박미정",
    "조승희",
    "오은숙",
    "정경희",
    "김명숙",
    "최영숙",
    "위영래",
    "정성임",
    "이도화",
    "강은채",
]
_NAMES_M = [
    "이재호",
    "임병태",
    "손동하",
    "봉수훈",
    "오민영",
    "이성기",
    "권상운",
    "백용일",
    "유상연",
    "송영범",
    "장남식",
    "이태호",
    "최옥남",
    "정승현",
    "이찬종",
]


def extract_persona_name(persona: dict[str, Any] | None) -> str | None:
    """Return an explicit or narrative-derived display name, if any."""
    if not isinstance(persona, dict):
        return None

    for key in _NAME_FIELDS:
        value = persona.get(key)
        if isinstance(value, str):
            cleaned = _clean_name(value)
            if cleaned:
                return cleaned

    for key in _NARRATIVE_FIELDS:
        value = persona.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        found = extract_name_from_narrative(value)
        if found:
            return found
    return None


def extract_name_from_narrative(text: str) -> str | None:
    raw = (text or "").strip()
    if not raw:
        return None
    # Normalize uncommon unicode spaces/hyphens that appear in Nemotron prose.
    sample = raw.replace("\u202f", " ").replace("\u00a0", " ")

    for pattern in (_KR_NAME, _JP_NAME, _VN_NAME, _LATIN_NAME, _LATIN_SINGLE):
        match = pattern.match(sample)
        if match:
            cleaned = _clean_name(match.group(1))
            if cleaned:
                return cleaned

    mid = _ES_MID_NAME.search(sample)
    if mid:
        cleaned = _clean_name(mid.group(1))
        if cleaned:
            return cleaned
    return None


def synthetic_korean_name(seed: str, sex: str = "") -> str:
    category = sex_category(sex)
    if category == "female":
        pool = _NAMES_F
    elif category == "male":
        pool = _NAMES_M
    else:
        pool = _NAMES_F + _NAMES_M
    if not seed:
        return pool[0]
    digest = int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16)
    return pool[digest % len(pool)]


def resolve_persona_name(persona: dict[str, Any] | None, uuid: str = "") -> str:
    """Prefer extracted name; otherwise a stable fallback label."""
    found = extract_persona_name(persona)
    if found:
        return found
    short = (uuid or "").replace("-", "")[:4] or "????"
    country = ""
    sex = ""
    if isinstance(persona, dict):
        country = str(persona.get("_country_id") or persona.get("country_id") or "").lower()
        sex = str(persona.get("sex") or "")
    if country in {"", "kr"}:
        return synthetic_korean_name(uuid or short, sex)
    return f"Persona {short}"


def sex_category(sex: Any) -> str:
    """Return 'male', 'female', or 'unknown' for multi-country sex labels."""
    if sex is None:
        return "unknown"
    text = str(sex).strip()
    if not text:
        return "unknown"
    lowered = text.casefold()
    if lowered in _MALE_VALUES or text in _MALE_VALUES:
        return "male"
    if lowered in _FEMALE_VALUES or text in _FEMALE_VALUES:
        return "female"
    # Substring fallbacks for labels like "Male (self-described)"
    if any(token in lowered for token in ("male", "mascul", "homme", "남자", "남성", "男")):
        if "female" not in lowered and "여성" not in lowered and "여자" not in lowered:
            return "male"
    if any(token in lowered for token in ("female", "femin", "femme", "여자", "여성", "女")):
        return "female"
    return "unknown"


def sex_short_label(sex: Any) -> str:
    category = sex_category(sex)
    if category == "male":
        return "남"
    if category == "female":
        return "여"
    return "미상"


def _clean_name(value: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", value).strip(" \t\r\n,.;:·")
    if not cleaned or len(cleaned) > 48:
        return None
    tokens = cleaned.split()
    if not tokens:
        return None
    if tokens[0].casefold() in _NAME_BLOCKLIST:
        return None
    # Reject pure digits / uuids
    if re.fullmatch(r"[0-9a-fA-F\-]{8,}", cleaned):
        return None
    return cleaned
