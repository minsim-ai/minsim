"""페르소나 → LLM system prompt 변환 (multi-country)."""

from src.data.datasets import DEFAULT_COUNTRY_ID, get_dataset

MARKETING_FIELDS = ["professional_persona", "family_persona", "culinary_persona", "persona"]
POLITICAL_FIELDS = ["cultural_background", "professional_persona", "persona"]
# 후속 인터뷰/코호트 질문: 식문화 서사가 조사 주제(선물/제품)를 덮어쓰지 않도록 제외
INTERVIEW_FIELDS = ["professional_persona", "family_persona", "persona"]


def build_system_prompt(
    persona: dict,
    purpose: str = "marketing",
) -> str:
    fields = _fields_for_purpose(purpose)
    country_id = str(persona.get("_country_id") or persona.get("country_id") or DEFAULT_COUNTRY_ID)
    try:
        dataset = get_dataset(country_id)
    except ValueError:
        dataset = get_dataset(DEFAULT_COUNTRY_ID)

    province = persona.get("province") or ""
    district = persona.get("district") or ""
    location = f"{province} {district}".strip() or str(persona.get("country") or dataset.country_name)

    demo_lines = [
        f"- 나이: {persona.get('age', 'unknown')}",
        f"- 성별: {persona.get('sex', 'unknown')}",
        f"- 거주지: {location}",
        f"- 직업: {persona.get('occupation', 'unknown')}",
        f"- 학력: {persona.get('education_level', 'unknown')}",
    ]
    if persona.get("marital_status"):
        demo_lines.append(f"- 결혼상태: {persona['marital_status']}")
    if persona.get("family_type"):
        demo_lines.append(f"- 가족형태: {persona['family_type']}")
    if persona.get("housing_type"):
        demo_lines.append(f"- 주거형태: {persona['housing_type']}")
    demo = "\n".join(demo_lines)

    narratives = "\n\n".join(
        f"[{field}]\n{persona[field]}" for field in fields if persona.get(field)
    )

    if dataset.country_id == "kr":
        identity = (
            f"당신은 다음 프로필을 가진 {dataset.nationality_phrase_ko}입니다. "
            "이 사람의 입장에서 자연스럽게 답변하세요.\n"
            "절대 'AI' 또는 '제가 답변드리겠습니다' 같은 어색한 말투를 쓰지 마세요.\n"
            "당신이 실제로 그 사람인 것처럼, 그 사람의 가치관과 경험으로 대답하세요.\n"
            f"{dataset.language_instruction}"
        )
    else:
        identity = (
            f"You are {dataset.nationality_phrase_en} with the following profile. "
            "Answer from this person's point of view.\n"
            "Do not mention being an AI or use robotic phrasing.\n"
            "Respond as if you are truly this person, using their values and experience.\n"
            f"{dataset.language_instruction}"
        )

    base = (
        f"{identity}\n\n"
        "## 인구통계 / Demographics\n"
        f"{demo}\n\n"
        "## 페르소나 / Persona\n"
        f"{narratives}"
    )
    if purpose in {"interview", "followup"}:
        if dataset.country_id == "kr":
            base += (
                "\n\n## 후속 조사 규칙\n"
                "- 사용자 메시지에 주어진 [조사 맥락] 주제 안에서만 답하세요.\n"
                "- 식습관·취미·운동 서사를 이번 조사의 제품/서비스/선물로 바꿔 말하지 마세요.\n"
                "- 조사 대상과 무관한 새로운 상품·행동을 지어내지 마세요."
            )
        else:
            base += (
                "\n\n## Follow-up research rules\n"
                "- Stay within the research topic given in the user message.\n"
                "- Do not reframe hobbies/food/sports narratives as the product under study.\n"
                "- Do not invent unrelated products or actions."
            )
    return base


def _fields_for_purpose(purpose: str) -> list[str]:
    if purpose == "marketing":
        return MARKETING_FIELDS
    if purpose in {"interview", "followup"}:
        return INTERVIEW_FIELDS
    return POLITICAL_FIELDS
