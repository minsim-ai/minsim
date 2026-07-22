"""Creative Testing 목업 결과 (와이어프레임 시각화용)"""
from src.mocks.personas import MOCK_PERSONAS

CREATIVES = [
    "신선한 아침을 여는 한 잔, 카페라떼",
    "활기찬 하루의 시작, 진한 아메리카노",
    "건강한 시작, 따뜻한 녹차",
]

CHOICE_COUNTS = {"A": 95, "B": 68, "C": 30}
CHOICE_PCT = {"A": 49.2, "B": 35.2, "C": 15.5}

REASONS_BY_CHOICE = {
    "A": [
        "달콤한 향이 출근길에 활력을 줘서요",
        "아침에 따뜻한 라떼 한 잔이 필수예요",
        "카페라떼는 어디서나 안전한 선택",
        "단맛이 부담스럽지 않게 좋아서",
        "아이들과 함께 먹어도 부담 없을 것 같아요",
        "프리미엄 느낌이 들어 매력적",
        "친근하고 익숙해서 신뢰가 가요",
        "회사 동료들과 나눠 마시기 좋을듯",
        "디자인이 깔끔해 보여요",
        "한 손에 들고 다니기 편할 것 같아",
    ],
    "B": [
        "아침에는 진한 커피로 정신 차리는 게 최고",
        "에스프레소 베이스라 만족감이 커요",
        "단 거 안 좋아하는 저한테 딱",
        "출근 전 카페인 충전",
        "메시지가 직설적이라 좋아요",
        "활기차다는 워딩이 마음에 들어요",
        "실용적이고 효율적인 느낌",
        "남자친구가 좋아할 것 같아요",
    ],
    "C": [
        "건강을 생각하면 녹차가 좋죠",
        "아메리카노보다 부담 없어서",
        "카페인 줄이려고 노력 중이라",
        "건강한 시작이라는 메시지가 좋아요",
        "특히 오후에는 녹차로 가볍게",
    ],
}

BREAKDOWN_BY_AGE = {
    "20대": {"A": 18, "B": 12, "C": 4},
    "30대": {"A": 28, "B": 20, "C": 7},
    "40대": {"A": 25, "B": 18, "C": 8},
    "50대": {"A": 15, "B": 12, "C": 6},
    "60대+": {"A": 9, "B": 6, "C": 5},
}
BREAKDOWN_BY_SEX = {
    "남자": {"A": 38, "B": 42, "C": 12},
    "여자": {"A": 57, "B": 26, "C": 18},
}
BREAKDOWN_BY_PROVINCE = {
    "서울": {"A": 32, "B": 24, "C": 11},
    "경기": {"A": 38, "B": 28, "C": 10},
    "부산": {"A": 12, "B": 7, "C": 4},
    "대구": {"A": 7, "B": 5, "C": 3},
    "기타": {"A": 6, "B": 4, "C": 2},
}

SAMPLE_SUMMARY = {
    "total": 200,
    "by_sex": {"남자": 102, "여자": 98},
    "by_age_bucket": {"20대": 34, "30대": 55, "40대": 51, "50대": 33, "60대+": 27},
    "by_province": {
        "서울": 60, "경기": 80, "부산": 25, "대구": 18, "인천": 10, "기타": 7,
    },
    "by_education": {
        "고등학교": 65, "4년제 대학교": 90, "대학원": 25, "전문대": 20,
    },
    "by_occupation_top10": [
        ("사무직", 45), ("전문직", 30), ("판매·서비스", 28), ("기술직", 22),
        ("공무원", 15), ("자영업", 18), ("관리자", 12), ("교육·연구", 10),
        ("의료", 8), ("금융", 12),
    ],
}


def get_mock_result() -> dict:
    """Creative Testing mock result envelope helper."""
    return {
        "creatives": CREATIVES,
        "total_responses": 193,
        "parse_failed": 7,
        "sample_size": 200,
        "choice_counts": CHOICE_COUNTS,
        "choice_pct": CHOICE_PCT,
        "reasons_by_choice": REASONS_BY_CHOICE,
        "breakdown_by_age": BREAKDOWN_BY_AGE,
        "breakdown_by_sex": BREAKDOWN_BY_SEX,
        "breakdown_by_province": BREAKDOWN_BY_PROVINCE,
        "sample_summary": SAMPLE_SUMMARY,
        "personas_with_responses": [
            (MOCK_PERSONAS[0], "선택: A — 아침에 라떼 한 잔이면 출근길이 한결 가벼워요. 달지 않아 좋고 디자인도 깔끔해 보입니다."),
            (MOCK_PERSONAS[1], "선택: B — 진한 커피가 카페인 효과가 더 큽니다. 직설적인 메시지가 마음에 듭니다."),
            (MOCK_PERSONAS[2], "선택: A — 인스타에 올리기 좋은 비주얼이고, 카페라떼는 실패가 없어요."),
            (MOCK_PERSONAS[3], "선택: B — 50대 남자에게 활기찬 시작이라는 메시지가 와닿습니다."),
            (MOCK_PERSONAS[4], "선택: A — 학교 가기 전 친구들과 나눠 마시기 좋을 것 같아요."),
            (MOCK_PERSONAS[5], "선택: C — 60대에는 녹차가 부담이 없습니다. 건강이 우선이죠."),
            (MOCK_PERSONAS[6], "선택: A — 가족과 함께 마시기 좋은 무난한 선택이에요."),
            (MOCK_PERSONAS[7], "선택: B — 새벽부터 일하니까 진한 커피가 필요해요."),
        ],
    }
