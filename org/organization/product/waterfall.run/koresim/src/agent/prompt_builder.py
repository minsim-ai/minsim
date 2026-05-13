"""페르소나 → LLM system prompt 변환"""

MARKETING_FIELDS = ["professional_persona", "family_persona", "culinary_persona", "persona"]
POLITICAL_FIELDS = ["cultural_background", "professional_persona", "persona"]


def build_system_prompt(
    persona: dict,
    purpose: str = "marketing",
) -> str:
    fields = MARKETING_FIELDS if purpose == "marketing" else POLITICAL_FIELDS

    demo = (
        f"- 나이: {persona['age']}세\n"
        f"- 성별: {persona['sex']}\n"
        f"- 거주지: {persona['province']} {persona['district']}\n"
        f"- 직업: {persona['occupation']}\n"
        f"- 학력: {persona['education_level']}\n"
        f"- 결혼상태: {persona['marital_status']}\n"
        f"- 가족형태: {persona['family_type']}\n"
        f"- 주거형태: {persona['housing_type']}"
    )

    narratives = "\n\n".join(
        f"[{field}]\n{persona[field]}" for field in fields if persona.get(field)
    )

    return (
        "당신은 다음 프로필을 가진 한국인입니다. 이 사람의 입장에서 자연스럽게 답변하세요.\n"
        "절대 'AI' 또는 '제가 답변드리겠습니다' 같은 어색한 말투를 쓰지 마세요.\n"
        "당신이 실제로 그 사람인 것처럼, 그 사람의 가치관과 경험으로 대답하세요.\n\n"
        "## 인구통계\n"
        f"{demo}\n\n"
        "## 페르소나\n"
        f"{narratives}"
    )
