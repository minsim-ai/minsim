"""Enterprise-safe demo presets for the KoreaSim React demo."""
from __future__ import annotations

from src.api.schemas import (
    BrandPerceptionInput,
    CampaignChannel,
    CampaignMessage,
    CampaignStrategyInput,
    ChurnPredictionInput,
    CompetitivePositioningInput,
    CreativeTestingInput,
    DemoPreset,
    MarketSegmentationInput,
    PriceOptimizationInput,
    ProductLaunchInput,
    SimulationType,
    TargetFilterModel,
    ValuePropositionInput,
)


DEMO_PRESETS: tuple[DemoPreset, ...] = (
    DemoPreset(
        id="galaxy-creative",
        title="Galaxy 광고 크리에이티브 비교",
        description="프리미엄, 생산성, 라이프스타일 톤의 메시지 선호도를 비교합니다.",
        simulation_type=SimulationType.CREATIVE_TESTING,
        input=CreativeTestingInput(
            creatives=[
                "당신의 하루를 더 빠르고 선명하게, Galaxy AI",
                "업무부터 취미까지 한 번에 정리되는 생산성 파트너",
                "매일의 순간을 영화처럼 남기는 라이프스타일 카메라",
            ]
        ),
        target_filter=TargetFilterModel(
            age_min=30,
            age_max=49,
            occupation_keywords=["직장인", "마케터", "기획", "개발", "디자이너"],
            exclude_unemployed=True,
        ),
        sample_size=50,
        seed=4242,
        demo_notes=[
            "30~49세 직장인 중심",
            "무직 페르소나 제외",
            "세그먼트별 메시지 선호도 확인",
        ],
    ),
    DemoPreset(
        id="coffee-price",
        title="스페셜티 커피 가격 최적화",
        description="데일리 프리미엄 커피의 가격 후보별 구매 의향과 지불의향가격을 비교합니다.",
        simulation_type=SimulationType.PRICE_OPTIMIZATION,
        input=PriceOptimizationInput(
            product_name="도심형 스페셜티 아메리카노",
            product_description="출근길에 빠르게 구매할 수 있는 싱글오리진 기반 프리미엄 아메리카노.",
            price_points=[4500, 5500, 6500, 7500],
            context_note="평일 오전 출근길 테이크아웃 상황",
        ),
        target_filter=TargetFilterModel(
            age_min=20,
            age_max=39,
        ),
        sample_size=50,
        seed=5500,
        demo_notes=[
            "20~39세 카페 이용층",
            "가격 후보별 수요 방향성 확인",
            "지불의향가격은 합성 페르소나 추산값",
        ],
    ),
    DemoPreset(
        id="home-cleaner-launch",
        title="AI 홈클리너 제품 출시 반응",
        description="맞벌이 가구를 위한 홈클리너 신제품의 출시 매력도와 포지셔닝을 검증합니다.",
        simulation_type=SimulationType.PRODUCT_LAUNCH,
        input=ProductLaunchInput(
            product_concept="센서로 생활 패턴을 학습해 청소 동선을 자동 최적화하는 소형 AI 홈클리너.",
            key_features=[
                "반려동물 털 집중 모드",
                "앱 기반 예약 및 금지구역 설정",
                "저소음 야간 청소",
            ],
            target_use_case="퇴근 후 청소 부담을 줄이고 싶은 30~49세 맞벌이 가구",
            expected_price_range="39만~59만원",
            alternatives=["일반 로봇청소기", "주 1회 청소 서비스"],
        ),
        target_filter=TargetFilterModel(age_min=30, age_max=49, exclude_unemployed=True),
        sample_size=50,
        seed=31049,
        demo_notes=["제품 출시 전 초기 반응", "구매/관망/거부 의향 분포"],
    ),
    DemoPreset(
        id="ott-value-prop",
        title="OTT 가치 제안 비교",
        description="K-content OTT의 세 가지 가치 제안 중 가장 설득력 있는 메시지를 비교합니다.",
        simulation_type=SimulationType.VALUE_PROPOSITION,
        input=ValuePropositionInput(
            product_context="한국 오리지널 콘텐츠와 가족 프로필을 강조하는 월 구독형 OTT 서비스.",
            statements=[
                "오직 여기서만 먼저 보는 한국 오리지널 시리즈",
                "놓친 회차와 명장면을 AI가 바로 찾아 이어보는 OTT",
                "월 구독료 하나로 가족 모두의 K-content 취향을 충족",
            ]
        ),
        target_filter=TargetFilterModel(age_min=20, age_max=39),
        sample_size=50,
        seed=9300,
        demo_notes=[
            "20~39세 OTT 이용층",
            "가치 제안별 설득력/명확성/공감도",
        ],
    ),
    DemoPreset(
        id="healthy-snack-segmentation",
        title="건강 간식 시장 세분화",
        description="저당 고단백 간식 카테고리의 수요 세그먼트와 핵심 니즈를 찾습니다.",
        simulation_type=SimulationType.MARKET_SEGMENTATION,
        input=MarketSegmentationInput(
            category="저당 고단백 간식",
            product_family="편의점과 온라인에서 구매 가능한 바/쿠키형 간식",
            core_questions=[
                "간식을 고를 때 가장 중요한 기준은 무엇인가요?",
                "건강 간식 구매를 망설이게 하는 요인은 무엇인가요?",
                "어떤 상황에서 이 제품을 반복 구매할 가능성이 높나요?",
            ],
            n_segments=6,
        ),
        target_filter=TargetFilterModel(age_min=20, age_max=49),
        sample_size=50,
        seed=20496,
        demo_notes=["수요 기반 세그먼트 후보", "니즈/페인 상위 분포"],
    ),
    DemoPreset(
        id="ott-positioning",
        title="OTT 경쟁 포지셔닝",
        description="K-content OTT 후보 서비스의 선호 점유와 강약점을 비교합니다.",
        simulation_type=SimulationType.COMPETITIVE_POSITIONING,
        input=CompetitivePositioningInput(
            category_context="월 구독형 OTT 서비스. 한국 오리지널, 가격, 추천 기능, 가족 이용 편의가 주요 선택 기준.",
            products=[
                "A: 한국 오리지널을 먼저 공개하는 프리미엄 OTT",
                "B: 저렴한 월 구독료와 가족 공유를 강조하는 OTT",
                "C: AI 추천과 장면 검색을 강조하는 OTT",
            ],
            attributes=["콘텐츠 독점성", "가격", "추천 정확도", "가족 편의"],
        ),
        target_filter=TargetFilterModel(age_min=20, age_max=39),
        sample_size=50,
        seed=6612,
        demo_notes=["제품별 선호 점유", "강점/약점 테마"],
    ),
    DemoPreset(
        id="coffee-brand-perception",
        title="커피 브랜드 인식",
        description="프리미엄 테이크아웃 커피 브랜드의 속성별 인식과 연상어를 확인합니다.",
        simulation_type=SimulationType.BRAND_PERCEPTION,
        input=BrandPerceptionInput(
            brand_name="Arabica Daily",
            category="도심형 프리미엄 테이크아웃 커피",
            attributes=["합리적 가격", "프리미엄 원두", "빠른 제공", "친환경 컵", "디저트 페어링"],
            context_note="직장 밀집 지역 신규 매장 오픈 전 브랜드 소개 노출",
        ),
        target_filter=TargetFilterModel(age_min=20, age_max=49, exclude_unemployed=True),
        sample_size=50,
        seed=7701,
        demo_notes=["브랜드 평균 점수", "긍정/부정 테마"],
    ),
    DemoPreset(
        id="telco-churn",
        title="통신 구독 이탈 위험",
        description="가격 인상과 경쟁사 할인 제안 상황에서 유지/이탈 의향을 추정합니다.",
        simulation_type=SimulationType.CHURN_PREDICTION,
        input=ChurnPredictionInput(
            service_name="5G 프리미엄 가족 결합 요금제",
            current_situation="가족 3명이 결합해 사용 중이며 데이터 사용량은 많지만 체감 혜택은 줄었다고 느끼는 상황.",
            trigger_event="월 요금이 8% 인상되고 장기 고객 쿠폰 혜택이 축소됨.",
            competitor_offer="동급 데이터와 OTT 쿠폰을 포함한 6개월 30% 할인 제안",
        ),
        target_filter=TargetFilterModel(age_min=30, age_max=59),
        sample_size=50,
        seed=8059,
        demo_notes=["이탈 위험률", "유지 훅 후보"],
    ),
    DemoPreset(
        id="cosmetics-campaign",
        title="비건 선케어 캠페인 전략",
        description="채널과 메시지 조합별 캠페인 반응을 비교합니다.",
        simulation_type=SimulationType.CAMPAIGN_STRATEGY,
        input=CampaignStrategyInput(
            product_context="민감성 피부를 위한 비건 선케어. 백탁이 적고 가벼운 사용감을 강조.",
            channels=[
                CampaignChannel(name="인스타그램", description="짧은 사용 전후 영상"),
                CampaignChannel(name="네이버 검색", description="성분과 후기 중심 검색 광고"),
                CampaignChannel(name="올리브영 앱", description="쿠폰과 랭킹 노출"),
            ],
            messages=[
                CampaignMessage(name="성분안심", creative="민감한 피부도 매일 쓰는 저자극 비건 선케어"),
                CampaignMessage(name="사용감", creative="백탁 없이 가볍게 밀착되는 데일리 선크림"),
                CampaignMessage(name="후기검증", creative="재구매 후기로 확인한 여름 필수 선케어"),
            ],
            budget=80_000_000,
        ),
        target_filter=TargetFilterModel(age_min=20, age_max=39),
        sample_size=50,
        seed=2398,
        demo_notes=["채널/메시지 조합", "반응률은 모델 기반 추정"],
    ),
)


def list_demo_presets() -> list[DemoPreset]:
    return list(DEMO_PRESETS)
