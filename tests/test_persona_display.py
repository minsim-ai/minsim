from src.data.datasets import get_dataset, normalize_persona_row
from src.data.persona_display import (
    extract_name_from_narrative,
    extract_persona_name,
    resolve_persona_name,
    sex_category,
    sex_short_label,
)


def test_extract_korean_name() -> None:
    assert extract_name_from_narrative("전기태 씨는 광주 서구에서 평생 하역 일을 하며 살아온 70대 가장") == "전기태"


def test_extract_us_english_names() -> None:
    assert (
        extract_name_from_narrative(
            "Mary Alberti is a routine-obsessed, bullet-journal aficionado who balances disciplined work"
        )
        == "Mary Alberti"
    )
    assert (
        extract_name_from_narrative(
            "Deeva Cintron, an 85-year-old garden-loving quilt-artisan and budget-guru"
        )
        == "Deeva Cintron"
    )
    assert extract_name_from_narrative("Betty is a methodical policy pro who balances") == "Betty"


def test_extract_jp_and_vn_names() -> None:
    assert extract_name_from_narrative("野本 花代子は、構造的予測力と節約志向を持つシニア介護リーダー") == "野本 花代子"
    assert (
        extract_name_from_narrative(
            "Nguyễn Thị Hoa, một phụ nữ trưởng thành sống ở Sài Gòn"
        )
        == "Nguyễn Thị Hoa"
    )


def test_extract_persona_name_prefers_explicit_then_narrative() -> None:
    persona = {
        "persona": "Mary Alberti is a front-line food service specialist.",
        "sex": "Female",
        "_country_id": "us",
    }
    assert extract_persona_name(persona) == "Mary Alberti"
    persona["name"] = "Custom Name"
    assert extract_persona_name(persona) == "Custom Name"


def test_resolve_persona_name_non_kr_fallback_is_not_korean() -> None:
    name = resolve_persona_name({"sex": "Male", "_country_id": "us"}, "abcd-1234")
    assert name == "Persona abcd"
    assert not any("\uac00" <= ch <= "\ud7a3" for ch in name)


def test_resolve_persona_name_kr_fallback_uses_korean_pool() -> None:
    name = resolve_persona_name({"sex": "여자", "_country_id": "kr"}, "seed-1")
    assert any("\uac00" <= ch <= "\ud7a3" for ch in name)


def test_sex_category_multi_country() -> None:
    assert sex_category("Female") == "female"
    assert sex_category("Male") == "male"
    assert sex_category("여자") == "female"
    assert sex_category("남자") == "male"
    assert sex_category("Masculino") == "male"
    assert sex_short_label("Female") == "여"
    assert sex_short_label("Male") == "남"


def test_normalize_persona_row_attaches_us_name() -> None:
    dataset = get_dataset("us")
    row = {
        "uuid": "us-name-1",
        "age": 28,
        "sex": "Female",
        "state": "WI",
        "city": "Madison",
        "occupation": "worker",
        "persona": "Mary Alberti is a routine-obsessed aficionado.",
    }
    normalized = normalize_persona_row(row, dataset)
    assert normalized["name"] == "Mary Alberti"
    assert normalized["province"] == "WI"
