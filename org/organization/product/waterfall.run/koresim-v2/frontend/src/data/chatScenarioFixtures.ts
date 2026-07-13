import type { SimulationType } from "../types/api";

export type ChatScenarioTurn = {
  stepId: string;
  assistantQuestion: string;
  userAnswer: string;
};

export type ChatScenarioFixture = {
  id: string;
  simulationType: SimulationType;
  title: string;
  userIntent: string;
  userRole: string;
  firstMessage: string;
  turns: ChatScenarioTurn[];
  advancedAnswer: string;
  interpretationGoal: string;
};

export const chatScenarioFixtures: ChatScenarioFixture[] = [
  {
    id: "creative-01-galaxy-ai",
    simulationType: "creative_testing",
    title: "스마트폰 AI 광고 카피 비교",
    userIntent: "신제품 캠페인에서 어떤 메시지를 메인으로 써야 할지 결정",
    userRole: "브랜드 마케터",
    firstMessage: "갤럭시 새 AI 기능 광고 카피 몇 개 중 뭐가 제일 먹힐지 보고 싶어요.",
    turns: [
      {
        stepId: "creatives",
        assistantQuestion: "비교할 광고 카피를 한 줄에 하나씩 입력해주세요 (2~5개).",
        userAnswer: "내 일정을 먼저 이해하는 Galaxy AI\n회의록부터 여행 계획까지 알아서 정리하는 스마트폰\n사진 속 순간을 더 선명하게 살려주는 AI 카메라",
      },
      {
        stepId: "target_age",
        assistantQuestion: "타겟 연령대는?",
        userAnswer: "25~44세, 수도권 직장인 중심",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "서울, 경기 / 남녀 전체 / seed 4201",
    interpretationGoal: "전체 승자뿐 아니라 30대 직장인에게 업무 효율 메시지가 더 강한지 확인",
  },
  {
    id: "creative-02-vegan-sunscreen",
    simulationType: "creative_testing",
    title: "비건 선크림 상세페이지 헤드라인",
    userIntent: "상세페이지 첫 화면 문구를 선택",
    userRole: "D2C 화장품 그로스 담당자",
    firstMessage: "비건 선크림 랜딩 첫 문구를 정해야 하는데 감으로 정하기 싫어요.",
    turns: [
      {
        stepId: "creatives",
        assistantQuestion: "비교할 광고 카피를 한 줄에 하나씩 입력해주세요 (2~5개).",
        userAnswer: "민감한 피부도 매일 쓰는 저자극 비건 선케어\n백탁 없이 가볍게 밀착되는 데일리 선크림\n재구매 후기로 검증된 여름 필수 선케어",
      },
      {
        stepId: "target_age",
        assistantQuestion: "타겟 연령대는?",
        userAnswer: "20~39세 여성",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "서울, 경기 / 여성만 / 민감성 피부 관심층으로 좁히고 싶음",
    interpretationGoal: "저자극, 사용감, 후기검증 중 구매 전환에 가까운 언어가 무엇인지 확인",
  },
  {
    id: "creative-03-bank-youth",
    simulationType: "creative_testing",
    title: "청년 금융앱 광고 메시지",
    userIntent: "앱 설치 캠페인의 메시지 방향 결정",
    userRole: "핀테크 퍼포먼스 마케터",
    firstMessage: "20대 대상 금융앱 광고 문구를 테스트하고 싶습니다.",
    turns: [
      {
        stepId: "creatives",
        assistantQuestion: "비교할 광고 카피를 한 줄에 하나씩 입력해주세요 (2~5개).",
        userAnswer: "월급 다음 날에도 돈이 남는 소비 습관\n내 지출을 자동으로 읽고 예산을 추천하는 금융앱\n청년을 위한 적금, 카드, 소비관리 한 번에",
      },
      {
        stepId: "target_age",
        assistantQuestion: "타겟 연령대는?",
        userAnswer: "20~29세",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "서울, 경기 / 대학생과 사회초년생이 섞이게",
    interpretationGoal: "절약 불안 해소형 메시지와 자동관리 편의형 메시지의 차이 확인",
  },
  {
    id: "creative-04-delivery-membership",
    simulationType: "creative_testing",
    title: "배달 멤버십 할인 메시지",
    userIntent: "구독 전환을 유도할 메인 혜택 카피 선택",
    userRole: "멤버십 PMM",
    firstMessage: "배달앱 멤버십 가입 유도 문구를 비교하고 싶어요.",
    turns: [
      {
        stepId: "creatives",
        assistantQuestion: "비교할 광고 카피를 한 줄에 하나씩 입력해주세요 (2~5개).",
        userAnswer: "매달 배달비 걱정 없이, 첫 주문부터 무료배송\n자주 시킬수록 더 크게 돌려받는 배달 멤버십\n혼밥부터 회식까지, 배달비를 멤버십 하나로 정리",
      },
      {
        stepId: "target_age",
        assistantQuestion: "타겟 연령대는?",
        userAnswer: "25~45세",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "서울 / 1인가구와 직장인 중심",
    interpretationGoal: "무료배송 직접혜택과 누적 리워드 메시지 중 가입 의향에 가까운 쪽 확인",
  },
  {
    id: "creative-05-language-app",
    simulationType: "creative_testing",
    title: "영어회화 앱 광고 카피",
    userIntent: "초보자 대상 앱 광고의 심리적 장벽을 낮추는 문구 선택",
    userRole: "교육앱 마케터",
    firstMessage: "영어회화 앱 카피를 몇 개 써봤는데 초보자에게 뭐가 나을지 모르겠어요.",
    turns: [
      {
        stepId: "creatives",
        assistantQuestion: "비교할 광고 카피를 한 줄에 하나씩 입력해주세요 (2~5개).",
        userAnswer: "틀려도 괜찮은 10분 영어 회화\n출근길에 AI 튜터와 한 문장씩 말하기\n왕초보도 오늘 바로 말문이 트이는 영어앱",
      },
      {
        stepId: "target_age",
        assistantQuestion: "타겟 연령대는?",
        userAnswer: "20~39세",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "50명 (빠른 데모)",
      },
    ],
    advancedAnswer: "직장인 중심 / seed 1205",
    interpretationGoal: "부담 완화, 습관화, 즉시효능 중 초보자에게 가장 설득력 있는 각도 확인",
  },
  {
    id: "price-01-specialty-coffee",
    simulationType: "price_optimization",
    title: "스페셜티 커피 가격대",
    userIntent: "신규 매장의 아메리카노 적정 가격 설정",
    userRole: "F&B 창업자",
    firstMessage: "프리미엄 테이크아웃 커피를 얼마에 팔아야 할지 감이 안 옵니다.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명·간단 설명?",
        userAnswer: "도심형 스페셜티 아메리카노, 싱글오리진 원두를 쓰고 출근길 빠른 제공을 강조합니다.",
      },
      {
        stepId: "prices",
        assistantQuestion: "비교할 가격대를 콤마로 구분해주세요 (3~6개).",
        userAnswer: "4500, 5500, 6500, 7500",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟? (연령·성별·지역)",
        userAnswer: "20~39세 직장인, 서울",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "강남, 여의도 같은 오피스 상권을 상정",
    interpretationGoal: "선호 가격뿐 아니라 가격 저항선과 프리미엄 수용 구간 확인",
  },
  {
    id: "price-02-protein-bar",
    simulationType: "price_optimization",
    title: "고단백바 편의점 가격",
    userIntent: "편의점 입점 전 권장 소비자가 결정",
    userRole: "CPG 브랜드 매니저",
    firstMessage: "저당 고단백바 가격 후보를 테스트해보고 싶어요.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명·간단 설명?",
        userAnswer: "저당 고단백 초코바, 단백질 18g, 당류 2g, 편의점과 헬스장 판매 예정",
      },
      {
        stepId: "prices",
        assistantQuestion: "비교할 가격대를 콤마로 구분해주세요 (3~6개).",
        userAnswer: "2500, 3200, 3900, 4500",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟? (연령·성별·지역)",
        userAnswer: "20~49세 운동 관심층",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "남녀 전체 / 서울, 경기 / 편의점 구매 상황",
    interpretationGoal: "건강 편익이 가격 프리미엄을 버틸 수 있는지 확인",
  },
  {
    id: "price-03-ai-saas",
    simulationType: "price_optimization",
    title: "B2B AI SaaS 월 구독료",
    userIntent: "초기 요금제 가격 후보 검증",
    userRole: "SaaS 창업자",
    firstMessage: "AI 리서치 SaaS를 월 얼마로 시작해야 할지 테스트하고 싶습니다.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명·간단 설명?",
        userAnswer: "한국어 고객 인터뷰와 리뷰를 자동 분석하는 B2B AI 리서치 SaaS",
      },
      {
        stepId: "prices",
        assistantQuestion: "비교할 가격대를 콤마로 구분해주세요 (3~6개).",
        userAnswer: "99000, 149000, 199000, 299000",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟? (연령·성별·지역)",
        userAnswer: "30~49세 스타트업 PM, 마케터, 리서처",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "직장인, 기획자, 마케터 키워드 포함",
    interpretationGoal: "도입 장벽이 되는 가격과 기능 가치가 납득되는 가격대 분리",
  },
  {
    id: "price-04-home-cleaner",
    simulationType: "price_optimization",
    title: "AI 홈클리너 출시 가격",
    userIntent: "가전 신제품 예상 가격대 검증",
    userRole: "가전 제품기획자",
    firstMessage: "AI 홈클리너를 어느 가격에 내야 구매 의향이 있을지 보고 싶어요.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명·간단 설명?",
        userAnswer: "생활패턴을 학습해서 청소 동선을 자동 최적화하는 소형 AI 홈클리너",
      },
      {
        stepId: "prices",
        assistantQuestion: "비교할 가격대를 콤마로 구분해주세요 (3~6개).",
        userAnswer: "390000, 490000, 590000, 690000",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟? (연령·성별·지역)",
        userAnswer: "30~49세 맞벌이 가구",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "서울, 경기 / 무직 제외",
    interpretationGoal: "가격이 기능 기대를 넘는 순간과 대체재 대비 수용 가격 확인",
  },
  {
    id: "price-05-premium-ott",
    simulationType: "price_optimization",
    title: "K-content OTT 월 구독료",
    userIntent: "OTT 가격 후보별 가입 의향 확인",
    userRole: "OTT 사업개발 담당자",
    firstMessage: "K콘텐츠 OTT를 새로 낸다면 가격을 얼마로 잡아야 할지 궁금합니다.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명·간단 설명?",
        userAnswer: "한국 오리지널 콘텐츠 선공개와 가족 프로필을 강조하는 월 구독형 OTT",
      },
      {
        stepId: "prices",
        assistantQuestion: "비교할 가격대를 콤마로 구분해주세요 (3~6개).",
        userAnswer: "7900, 9900, 12900, 15900",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟? (연령·성별·지역)",
        userAnswer: "20~39세 OTT 이용자",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "서울, 경기 / 가족 공유 경험자 포함",
    interpretationGoal: "저가 진입과 프리미엄 콘텐츠 명분 사이의 균형점 확인",
  },
  {
    id: "launch-01-pet-cleaner",
    simulationType: "product_launch",
    title: "반려동물 털 특화 청소기 출시 반응",
    userIntent: "출시 전 구매/관망/거부 이유 확인",
    userRole: "가전 신사업 PM",
    firstMessage: "반려동물 털 청소에 특화된 무선청소기 컨셉을 출시해도 될지 보고 싶어요.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명?",
        userAnswer: "펫케어 무선청소기 P1",
      },
      {
        stepId: "spec",
        assistantQuestion: "주요 스펙·특징을 적어주세요.",
        userAnswer: "반려동물 털 엉킴 방지 브러시\n침구와 소파용 UV 살균 헤드\n저소음 야간 청소 모드\n앱으로 필터 교체 알림",
      },
      {
        stepId: "price",
        assistantQuestion: "가격은?",
        userAnswer: "599,000원",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "30~49세 반려동물 양육 가구",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "서울, 경기 / 무직 제외 / seed 3101",
    interpretationGoal: "구매 의향을 만드는 기능과 가격 저항 이유를 분리",
  },
  {
    id: "launch-02-senior-meal",
    simulationType: "product_launch",
    title: "시니어 맞춤 간편식",
    userIntent: "신제품 컨셉의 수용성과 구매자/사용자 분리 확인",
    userRole: "식품 브랜드 상품기획자",
    firstMessage: "부모님용 건강 간편식 컨셉을 테스트해보고 싶습니다.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명?",
        userAnswer: "부모님 밸런스 한끼",
      },
      {
        stepId: "spec",
        assistantQuestion: "주요 스펙·특징을 적어주세요.",
        userAnswer: "저염 고단백 반찬 구성\n전자레인지 3분 조리\n씹기 쉬운 식감\n월 정기배송 가능",
      },
      {
        stepId: "price",
        assistantQuestion: "가격은?",
        userAnswer: "1식 8,900원 / 월 20식 169,000원",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "40~59세 부모님 식사를 챙기는 자녀",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "서울, 경기 / 기혼 직장인 중심",
    interpretationGoal: "실사용자보다 구매 의사결정자인 자녀 관점에서 장벽 확인",
  },
  {
    id: "launch-03-ai-note",
    simulationType: "product_launch",
    title: "회의록 AI 노트 앱",
    userIntent: "B2B 생산성 앱 초기 반응 확인",
    userRole: "B2B SaaS PM",
    firstMessage: "회의록 자동정리 앱을 만들고 있는데 출시 전 반응이 궁금합니다.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명?",
        userAnswer: "MeetingNote AI",
      },
      {
        stepId: "spec",
        assistantQuestion: "주요 스펙·특징을 적어주세요.",
        userAnswer: "화상회의 녹취 자동 요약\n할 일과 담당자 자동 추출\nNotion, Slack 연동\n민감정보 마스킹",
      },
      {
        stepId: "price",
        assistantQuestion: "가격은?",
        userAnswer: "사용자당 월 19,000원",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "25~44세 스타트업, IT 기업 직장인",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "기획, 개발, 마케터 직군 중심",
    interpretationGoal: "생산성 효용과 보안 우려 중 무엇이 더 크게 작동하는지 확인",
  },
  {
    id: "launch-04-kids-coding",
    simulationType: "product_launch",
    title: "초등 코딩 구독 서비스",
    userIntent: "부모 대상 교육상품 반응 검증",
    userRole: "에듀테크 사업개발 담당자",
    firstMessage: "초등학생 코딩 구독 서비스를 출시해도 될지 부모 반응을 보고 싶어요.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명?",
        userAnswer: "키즈코딩 홈스쿨",
      },
      {
        stepId: "spec",
        assistantQuestion: "주요 스펙·특징을 적어주세요.",
        userAnswer: "주 2회 AI 튜터 코딩 미션\n블록코딩에서 파이썬까지 단계형 커리큘럼\n부모용 학습 리포트 제공\n월 1회 라이브 멘토링",
      },
      {
        stepId: "price",
        assistantQuestion: "가격은?",
        userAnswer: "월 79,000원",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "30~49세 초등학생 자녀 부모",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "서울, 경기 / 교육 관심 높은 가구",
    interpretationGoal: "코딩 필요성 인식과 월 구독 부담의 균형 확인",
  },
  {
    id: "launch-05-reusable-cup",
    simulationType: "product_launch",
    title: "오피스 재사용컵 서비스",
    userIntent: "B2B 친환경 서비스 도입 반응 확인",
    userRole: "친환경 서비스 창업자",
    firstMessage: "사무실용 재사용컵 구독 서비스를 검증하고 싶습니다.",
    turns: [
      {
        stepId: "product",
        assistantQuestion: "제품명?",
        userAnswer: "오피스 리컵",
      },
      {
        stepId: "spec",
        assistantQuestion: "주요 스펙·특징을 적어주세요.",
        userAnswer: "회사 탕비실에 재사용컵 비치\n매일 회수, 세척, 재공급\n개인컵 없이 일회용컵 절감\nESG 리포트용 사용량 대시보드",
      },
      {
        stepId: "price",
        assistantQuestion: "가격은?",
        userAnswer: "직원 1인당 월 4,900원",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "30~59세 총무, HR, ESG 담당자",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명",
      },
    ],
    advancedAnswer: "서울 오피스 밀집 지역",
    interpretationGoal: "ESG 명분이 실제 도입 의향으로 이어지는지 확인",
  },
  {
    id: "vp-01-ai-research",
    simulationType: "value_proposition",
    title: "AI 리서치 SaaS 가치 제안",
    userIntent: "랜딩페이지 헤드라인 방향 결정",
    userRole: "SaaS 대표",
    firstMessage: "우리 AI 리서치툴의 가치 제안 문구를 고르고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트를 한 줄로 적어주세요.",
        userAnswer: "한국어 고객 인터뷰, 리뷰, 설문 응답을 자동으로 분석하는 B2B AI 리서치 SaaS",
      },
      {
        stepId: "vps",
        assistantQuestion: "비교할 가치 제안 문장을 줄바꿈으로 적어주세요.",
        userAnswer: "고객의 목소리를 10분 만에 의사결정 보고서로\n한국어 비정형 데이터에 최적화된 AI 리서치 분석\n리서처 없이도 매주 고객 인사이트를 축적하는 팀 도구",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "30~49세 PM, 마케터, 리서처",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "B2B SaaS 구매 경험자 위주",
    interpretationGoal: "속도, 한국어 특화, 조직 학습 중 구매 설득의 핵심 축 확인",
  },
  {
    id: "vp-02-healthy-snack",
    simulationType: "value_proposition",
    title: "건강 간식 가치 제안",
    userIntent: "패키지 앞면과 상세페이지 메시지 결정",
    userRole: "식품 브랜드 마케터",
    firstMessage: "저당 고단백 간식의 핵심 가치 제안을 비교하고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트를 한 줄로 적어주세요.",
        userAnswer: "편의점과 온라인에서 파는 저당 고단백 바, 단백질 18g, 당류 2g",
      },
      {
        stepId: "vps",
        assistantQuestion: "비교할 가치 제안 문장을 줄바꿈으로 적어주세요.",
        userAnswer: "단백질은 채우고 당은 낮춘 오후 간식\n운동 후에도, 야근 중에도 부담 없는 고단백바\n초콜릿 맛은 그대로, 당 걱정은 줄인 건강 간식",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "20~39세 운동, 다이어트 관심층",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "여성 비중 약간 높게, 서울 경기",
    interpretationGoal: "건강 효용과 맛 유지 메시지 중 구매 장벽을 더 잘 낮추는 축 확인",
  },
  {
    id: "vp-03-family-ott",
    simulationType: "value_proposition",
    title: "가족형 OTT 가치 제안",
    userIntent: "OTT 서비스 소개문 선택",
    userRole: "OTT 서비스 기획자",
    firstMessage: "새 OTT의 가치 제안 3개를 비교해보고 싶습니다.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트를 한 줄로 적어주세요.",
        userAnswer: "한국 오리지널 콘텐츠와 가족 프로필을 강조하는 월 구독형 OTT",
      },
      {
        stepId: "vps",
        assistantQuestion: "비교할 가치 제안 문장을 줄바꿈으로 적어주세요.",
        userAnswer: "오직 여기서만 먼저 보는 한국 오리지널 시리즈\n월 구독료 하나로 가족 모두의 K-content 취향을 충족\n놓친 장면과 회차를 AI가 바로 찾아 이어보는 OTT",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "20~39세 OTT 이용자",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "가족 공유 경험자 포함",
    interpretationGoal: "콘텐츠 독점성, 가족 경제성, AI 편의 중 첫 가입 이유에 가까운 요소 확인",
  },
  {
    id: "vp-04-career-platform",
    simulationType: "value_proposition",
    title: "커리어 플랫폼 가치 제안",
    userIntent: "구직자 대상 서비스 포지셔닝 선택",
    userRole: "HR 플랫폼 PM",
    firstMessage: "커리어 플랫폼 메시지를 구직자 관점에서 비교하고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트를 한 줄로 적어주세요.",
        userAnswer: "이직 의사가 있는 직장인에게 맞춤 공고, 연봉 정보, 커리어 코칭을 제공하는 플랫폼",
      },
      {
        stepId: "vps",
        assistantQuestion: "비교할 가치 제안 문장을 줄바꿈으로 적어주세요.",
        userAnswer: "내 경력에 맞는 이직 기회만 골라 받는 커리어 플랫폼\n연봉과 성장 가능성까지 비교하고 지원하세요\n지금 당장 이직하지 않아도 커리어 선택지를 넓히는 곳",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "25~44세 직장인",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "개발, 마케팅, 기획 직군 포함",
    interpretationGoal: "적극 이직자와 잠재 이직자에게 다른 메시지가 필요한지 확인",
  },
  {
    id: "vp-05-senior-finance",
    simulationType: "value_proposition",
    title: "시니어 금융앱 가치 제안",
    userIntent: "고령층과 보호자 모두에게 설득되는 가치 제안 탐색",
    userRole: "금융앱 기획자",
    firstMessage: "부모님 세대용 금융앱의 가치 제안을 테스트하고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트를 한 줄로 적어주세요.",
        userAnswer: "고령층이 송금, 공과금, 보이스피싱 위험 확인을 쉽게 할 수 있는 금융앱",
      },
      {
        stepId: "vps",
        assistantQuestion: "비교할 가치 제안 문장을 줄바꿈으로 적어주세요.",
        userAnswer: "큰 글씨와 쉬운 안내로 부모님도 안심하고 쓰는 금융앱\n보이스피싱 위험을 먼저 알려주는 안전한 송금 도우미\n자녀가 함께 확인하고 도와줄 수 있는 가족 금융앱",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "50~69세와 30~49세 자녀층",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "서울, 경기 / 디지털 금융 이용 경험자",
    interpretationGoal: "편의성, 안전성, 가족지원 중 신뢰 형성에 중요한 메시지 확인",
  },
  {
    id: "seg-01-healthy-snack",
    simulationType: "market_segmentation",
    title: "저당 고단백 간식 시장 세분화",
    userIntent: "초기 타겟 세그먼트와 니즈 우선순위 발견",
    userRole: "식품 스타트업 대표",
    firstMessage: "건강 간식 시장에서 누구를 먼저 공략해야 할지 세그먼트를 찾고 싶어요.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "분석할 카테고리는?",
        userAnswer: "저당 고단백 간식",
      },
      {
        stepId: "questions",
        assistantQuestion: "조사 질문 2~4개를 줄바꿈으로 적어주세요.",
        userAnswer: "간식을 고를 때 가장 중요한 기준은 무엇인가요?\n건강 간식 구매를 망설이게 하는 요인은 무엇인가요?\n어떤 상황에서 반복 구매할 가능성이 높나요?",
      },
      {
        stepId: "n_segments",
        assistantQuestion: "추출할 세그먼트 수는?",
        userAnswer: "6개 (표준)",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~49세 / 서울 경기",
    interpretationGoal: "크기보다 반복 구매 상황이 뚜렷한 세그먼트 찾기",
  },
  {
    id: "seg-02-ev-buyer",
    simulationType: "market_segmentation",
    title: "전기차 구매 고려층 세분화",
    userIntent: "전기차 메시지를 세그먼트별로 나누기",
    userRole: "자동차 브랜드 전략 담당자",
    firstMessage: "전기차 구매 고려층을 좀 나눠보고 싶습니다.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "분석할 카테고리는?",
        userAnswer: "전기차",
      },
      {
        stepId: "questions",
        assistantQuestion: "조사 질문 2~4개를 줄바꿈으로 적어주세요.",
        userAnswer: "전기차 구매에서 가장 기대하는 점은 무엇인가요?\n가장 큰 걱정은 무엇인가요?\n어떤 조건이면 내연기관차 대신 전기차를 선택하겠습니까?",
      },
      {
        stepId: "n_segments",
        assistantQuestion: "추출할 세그먼트 수는?",
        userAnswer: "6개 (표준)",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "30~59세 / 서울 경기 / 차량 구매 가능층",
    interpretationGoal: "충전 불안, 유지비, 친환경, 성능 기대가 어떻게 갈리는지 확인",
  },
  {
    id: "seg-03-online-education",
    simulationType: "market_segmentation",
    title: "성인 온라인 교육 시장 세분화",
    userIntent: "교육 상품 라인업을 세그먼트별로 구성",
    userRole: "에듀테크 마케터",
    firstMessage: "성인 온라인 교육 시장의 세그먼트를 찾고 싶어요.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "분석할 카테고리는?",
        userAnswer: "성인 온라인 교육",
      },
      {
        stepId: "questions",
        assistantQuestion: "조사 질문 2~4개를 줄바꿈으로 적어주세요.",
        userAnswer: "온라인 강의를 듣는 가장 큰 목적은 무엇인가요?\n완강을 방해하는 요인은 무엇인가요?\n어떤 형태의 학습 지원이 있으면 결제하겠습니까?",
      },
      {
        stepId: "n_segments",
        assistantQuestion: "추출할 세그먼트 수는?",
        userAnswer: "6개 (표준)",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~49세 직장인 중심",
    interpretationGoal: "자격증, 이직, 취미, 업무역량 세그먼트별 결제 동기 파악",
  },
  {
    id: "seg-04-home-fitness",
    simulationType: "market_segmentation",
    title: "홈 피트니스 시장 세분화",
    userIntent: "홈트 서비스의 초기 타겟 발견",
    userRole: "헬스케어 앱 PM",
    firstMessage: "홈 피트니스 앱을 누구에게 먼저 팔아야 할지 세그먼트를 보고 싶어요.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "분석할 카테고리는?",
        userAnswer: "홈 피트니스 앱과 온라인 PT",
      },
      {
        stepId: "questions",
        assistantQuestion: "조사 질문 2~4개를 줄바꿈으로 적어주세요.",
        userAnswer: "집에서 운동하려는 이유는 무엇인가요?\n운동을 지속하지 못하는 이유는 무엇인가요?\n돈을 내고 싶은 코칭 기능은 무엇인가요?",
      },
      {
        stepId: "n_segments",
        assistantQuestion: "추출할 세그먼트 수는?",
        userAnswer: "6개 (표준)",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~44세 / 서울 경기 / 운동 관심층",
    interpretationGoal: "동기부여형, 체중관리형, 시간절약형 등 타겟 메시지 분리",
  },
  {
    id: "seg-05-pet-care",
    simulationType: "market_segmentation",
    title: "반려동물 케어 시장 세분화",
    userIntent: "반려동물 서비스 카테고리의 니즈 클러스터 발견",
    userRole: "펫테크 창업자",
    firstMessage: "반려동물 케어 시장에서 어떤 고객군이 있는지 알고 싶습니다.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "분석할 카테고리는?",
        userAnswer: "반려동물 케어 서비스",
      },
      {
        stepId: "questions",
        assistantQuestion: "조사 질문 2~4개를 줄바꿈으로 적어주세요.",
        userAnswer: "반려동물 케어에서 가장 번거로운 점은 무엇인가요?\n돈을 내고 맡기고 싶은 일은 무엇인가요?\n서비스를 신뢰하기 위해 필요한 조건은 무엇인가요?",
      },
      {
        stepId: "n_segments",
        assistantQuestion: "추출할 세그먼트 수는?",
        userAnswer: "6개 (표준)",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "25~49세 / 서울 경기 / 반려동물 양육자",
    interpretationGoal: "돌봄 위탁, 건강관리, 청소, 훈련 니즈 중 초기 사업기회 확인",
  },
  {
    id: "position-01-ott",
    simulationType: "competitive_positioning",
    title: "OTT 경쟁 포지셔닝",
    userIntent: "신규 OTT의 차별화 포지션 탐색",
    userRole: "미디어 사업 전략 담당자",
    firstMessage: "우리 OTT가 기존 서비스 사이에서 어떻게 보일지 알고 싶어요.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "카테고리는?",
        userAnswer: "월 구독형 OTT 서비스",
      },
      {
        stepId: "competitors",
        assistantQuestion: "경쟁사·우리 제품을 줄당 1개로 적어주세요. (이름 — 설명)",
        userAnswer: "넷플릭스 — 글로벌 오리지널과 추천 기능 강점\n티빙 — K콘텐츠와 예능 강점\n쿠팡플레이 — 와우 멤버십 번들 가격 강점\n우리 OTT — 한국 오리지널 선공개와 가족 프로필 강점",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "20~39세 OTT 이용자",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "서울 경기 / 가족 공유 경험자 포함",
    interpretationGoal: "기존 강자 대비 우리 포지션이 독점 콘텐츠인지 가족 편의인지 확인",
  },
  {
    id: "position-02-coffee",
    simulationType: "competitive_positioning",
    title: "커피 체인 포지셔닝",
    userIntent: "신규 커피 브랜드의 경쟁상 위치 확인",
    userRole: "F&B 브랜드 전략 담당자",
    firstMessage: "새 커피 브랜드가 스타벅스, 메가커피 사이에서 어떻게 보일지 보고 싶습니다.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "카테고리는?",
        userAnswer: "테이크아웃 커피 전문점",
      },
      {
        stepId: "competitors",
        assistantQuestion: "경쟁사·우리 제품을 줄당 1개로 적어주세요. (이름 — 설명)",
        userAnswer: "스타벅스 — 프리미엄 공간과 브랜드 신뢰\n메가커피 — 저가 대용량\n컴포즈커피 — 가성비와 접근성\n우리 브랜드 — 빠른 제공과 좋은 원두의 합리적 가격",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "20~49세 직장인",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "서울 오피스 상권",
    interpretationGoal: "프리미엄과 가성비 사이에서 차별적 이유가 생기는지 확인",
  },
  {
    id: "position-03-bank-app",
    simulationType: "competitive_positioning",
    title: "청년 금융앱 경쟁 포지셔닝",
    userIntent: "핀테크 앱의 차별화 메시지 찾기",
    userRole: "핀테크 전략 담당자",
    firstMessage: "청년 금융앱이 토스, 카카오뱅크 사이에서 어떻게 보일지 궁금합니다.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "카테고리는?",
        userAnswer: "모바일 금융앱",
      },
      {
        stepId: "competitors",
        assistantQuestion: "경쟁사·우리 제품을 줄당 1개로 적어주세요. (이름 — 설명)",
        userAnswer: "토스 — 송금과 금융 통합 경험\n카카오뱅크 — 쉬운 은행 서비스와 대중성\n네이버페이 — 결제와 포인트 생태계\n우리 앱 — 청년 소비관리와 자동 예산 추천",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "20~34세",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "사회초년생, 대학생 포함",
    interpretationGoal: "종합금융보다 소비관리 특화가 충분히 선명한지 확인",
  },
  {
    id: "position-04-delivery",
    simulationType: "competitive_positioning",
    title: "배달앱 멤버십 포지셔닝",
    userIntent: "멤버십 혜택 구조의 경쟁력 확인",
    userRole: "플랫폼 멤버십 PM",
    firstMessage: "배달앱 멤버십이 경쟁사 대비 어떻게 받아들여질지 테스트하고 싶어요.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "카테고리는?",
        userAnswer: "배달앱 멤버십",
      },
      {
        stepId: "competitors",
        assistantQuestion: "경쟁사·우리 제품을 줄당 1개로 적어주세요. (이름 — 설명)",
        userAnswer: "배민클럽 — 배달비 할인과 제휴 혜택\n쿠팡와우 — 무료배송과 OTT 번들\n요기패스 — 할인 쿠폰 중심\n우리 멤버십 — 자주 주문할수록 커지는 배달비 캐시백",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "25~45세 배달앱 월 4회 이상 이용자",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "서울 / 1인가구 포함",
    interpretationGoal: "캐시백 구조가 즉시 할인 대비 이해되고 매력적인지 확인",
  },
  {
    id: "position-05-ev",
    simulationType: "competitive_positioning",
    title: "전기차 브랜드 포지셔닝",
    userIntent: "신규 전기차 모델의 경쟁 인식 확인",
    userRole: "자동차 상품전략 담당자",
    firstMessage: "신규 전기차 모델이 아이오닉, 테슬라, EV6 대비 어떻게 보일지 보고 싶습니다.",
    turns: [
      {
        stepId: "category",
        assistantQuestion: "카테고리는?",
        userAnswer: "중형 전기 SUV",
      },
      {
        stepId: "competitors",
        assistantQuestion: "경쟁사·우리 제품을 줄당 1개로 적어주세요. (이름 — 설명)",
        userAnswer: "아이오닉5 — 디자인과 충전 인프라 신뢰\n테슬라 모델Y — 소프트웨어와 브랜드 상징성\n기아 EV6 — 주행성능과 상품성\n우리 모델 — 긴 주행거리와 넓은 실내, 합리적 가격",
      },
      {
        stepId: "target",
        assistantQuestion: "타겟?",
        userAnswer: "30~59세 차량 구매 고려자",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "서울 경기 / 가족 단위 이동 니즈",
    interpretationGoal: "가격/공간 가치가 브랜드 선호를 이길 수 있는지 확인",
  },
  {
    id: "brand-01-premium-coffee",
    simulationType: "brand_perception",
    title: "프리미엄 커피 브랜드 인식",
    userIntent: "신규 매장 오픈 전 브랜드 이미지 진단",
    userRole: "F&B 브랜드 매니저",
    firstMessage: "우리 커피 브랜드가 어떻게 인식될지 측정해보고 싶어요.",
    turns: [
      {
        stepId: "brand",
        assistantQuestion: "브랜드명은?",
        userAnswer: "Arabica Daily",
      },
      {
        stepId: "compare",
        assistantQuestion: "비교 브랜드 (콤마, 선택)",
        userAnswer: "스타벅스, 투썸플레이스, 메가커피",
      },
      {
        stepId: "attributes",
        assistantQuestion: "측정할 이미지 속성을 줄바꿈으로 (8~15개 권장).",
        userAnswer: "프리미엄\n합리적 가격\n빠른 제공\n원두 전문성\n친환경\n직장인 친화\n디저트 페어링\n재방문 의향",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~49세 서울 직장인",
    interpretationGoal: "프리미엄과 합리적 가격이 충돌하지 않고 공존하는지 확인",
  },
  {
    id: "brand-02-vegan-beauty",
    simulationType: "brand_perception",
    title: "비건 뷰티 브랜드 인식",
    userIntent: "브랜드 리뉴얼 전 핵심 이미지 확인",
    userRole: "뷰티 브랜드 디렉터",
    firstMessage: "비건 화장품 브랜드 이미지가 고객에게 어떻게 보일지 알고 싶습니다.",
    turns: [
      {
        stepId: "brand",
        assistantQuestion: "브랜드명은?",
        userAnswer: "PureLeaf",
      },
      {
        stepId: "compare",
        assistantQuestion: "비교 브랜드 (콤마, 선택)",
        userAnswer: "아로마티카, 라운드랩, 닥터지",
      },
      {
        stepId: "attributes",
        assistantQuestion: "측정할 이미지 속성을 줄바꿈으로 (8~15개 권장).",
        userAnswer: "저자극\n비건\n성분 신뢰\n효능감\n가벼운 사용감\n가격 합리성\n친환경\n재구매 의향",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~39세 여성 / 민감성 피부 관심층",
    interpretationGoal: "비건 이미지가 효능감 부족으로 읽히는지 확인",
  },
  {
    id: "brand-03-fintech",
    simulationType: "brand_perception",
    title: "핀테크 앱 브랜드 인식",
    userIntent: "신뢰와 혁신 이미지의 균형 확인",
    userRole: "핀테크 브랜드 담당자",
    firstMessage: "새 금융앱 브랜드가 믿을 만하게 보이는지 테스트하고 싶어요.",
    turns: [
      {
        stepId: "brand",
        assistantQuestion: "브랜드명은?",
        userAnswer: "머니루틴",
      },
      {
        stepId: "compare",
        assistantQuestion: "비교 브랜드 (콤마, 선택)",
        userAnswer: "토스, 카카오뱅크, 뱅크샐러드",
      },
      {
        stepId: "attributes",
        assistantQuestion: "측정할 이미지 속성을 줄바꿈으로 (8~15개 권장).",
        userAnswer: "신뢰\n보안\n쉬움\n청년 친화\n소비관리 전문성\n혁신\n친근함\n장기 사용 의향",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~34세 / 금융앱 사용 경험자",
    interpretationGoal: "친근함과 보안 신뢰가 동시에 확보되는지 확인",
  },
  {
    id: "brand-04-edtech",
    simulationType: "brand_perception",
    title: "온라인 교육 브랜드 인식",
    userIntent: "교육 서비스의 신뢰/성과 이미지 확인",
    userRole: "에듀테크 마케팅 리드",
    firstMessage: "우리 온라인 교육 브랜드가 어떤 이미지인지 보고 싶습니다.",
    turns: [
      {
        stepId: "brand",
        assistantQuestion: "브랜드명은?",
        userAnswer: "스킬업랩",
      },
      {
        stepId: "compare",
        assistantQuestion: "비교 브랜드 (콤마, 선택)",
        userAnswer: "패스트캠퍼스, 클래스101, 인프런",
      },
      {
        stepId: "attributes",
        assistantQuestion: "측정할 이미지 속성을 줄바꿈으로 (8~15개 권장).",
        userAnswer: "실무성\n완강 가능성\n전문성\n가격 합리성\n커리어 도움\n멘토링 신뢰\n초보자 친화\n재수강 의향",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "25~44세 직장인",
    interpretationGoal: "실무성과 완강 가능성 중 브랜드 선택 이유가 되는 이미지 확인",
  },
  {
    id: "brand-05-petcare",
    simulationType: "brand_perception",
    title: "펫케어 브랜드 인식",
    userIntent: "신규 펫케어 서비스의 신뢰 이미지 확인",
    userRole: "펫테크 브랜드 매니저",
    firstMessage: "펫케어 서비스 브랜드가 신뢰롭게 보일지 측정해보고 싶어요.",
    turns: [
      {
        stepId: "brand",
        assistantQuestion: "브랜드명은?",
        userAnswer: "펫케어링",
      },
      {
        stepId: "compare",
        assistantQuestion: "비교 브랜드 (콤마, 선택)",
        userAnswer: "펫프렌즈, 핏펫, 어바웃펫",
      },
      {
        stepId: "attributes",
        assistantQuestion: "측정할 이미지 속성을 줄바꿈으로 (8~15개 권장).",
        userAnswer: "전문성\n신뢰\n따뜻함\n가격 합리성\n응급 대응\n예약 편의\n후기 신뢰\n재이용 의향",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "25~49세 반려동물 양육자",
    interpretationGoal: "돌봄 서비스에서 따뜻함보다 전문 신뢰가 더 중요한지 확인",
  },
  {
    id: "churn-01-telco-price",
    simulationType: "churn_prediction",
    title: "통신 요금 인상 이탈 위험",
    userIntent: "가격 인상 후 유지/이탈 위험 확인",
    userRole: "통신사 CRM 담당자",
    firstMessage: "5G 요금제 가격 인상 후 이탈 위험을 보고 싶습니다.",
    turns: [
      {
        stepId: "service",
        assistantQuestion: "서비스명?",
        userAnswer: "5G 프리미엄 가족 결합 요금제",
      },
      {
        stepId: "current",
        assistantQuestion: "현재 상황을 적어주세요.",
        userAnswer: "가족 3명이 결합해 사용 중이고 데이터 사용량은 많지만 체감 혜택은 줄었다고 느끼는 상황",
      },
      {
        stepId: "trigger",
        assistantQuestion: "이탈 유발 이벤트는?",
        userAnswer: "월 요금이 8% 인상되고 장기 고객 쿠폰 혜택이 축소됨",
      },
      {
        stepId: "competitor",
        assistantQuestion: "경쟁사 제안 (선택)",
        userAnswer: "동급 데이터와 OTT 쿠폰을 포함한 6개월 30% 할인 제안",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "30~59세 / 가족 결합 이용자",
    interpretationGoal: "이탈을 막는 혜택이 가격 할인인지 가족 결합 유지인지 확인",
  },
  {
    id: "churn-02-saas-renewal",
    simulationType: "churn_prediction",
    title: "B2B SaaS 갱신 이탈 위험",
    userIntent: "연간 갱신 전 이탈 사유와 방어 메시지 확인",
    userRole: "SaaS CS 리드",
    firstMessage: "SaaS 고객들이 갱신 시점에 이탈할지 예측해보고 싶어요.",
    turns: [
      {
        stepId: "service",
        assistantQuestion: "서비스명?",
        userAnswer: "B2B 고객 데이터 분석 SaaS",
      },
      {
        stepId: "current",
        assistantQuestion: "현재 상황을 적어주세요.",
        userAnswer: "월 199,000원 팀 요금제를 10개월 사용했고 리포트 기능은 쓰지만 자동화 기능 사용률은 낮음",
      },
      {
        stepId: "trigger",
        assistantQuestion: "이탈 유발 이벤트는?",
        userAnswer: "연간 갱신 시점에 가격이 15% 인상되고 무료 컨설팅 혜택이 종료됨",
      },
      {
        stepId: "competitor",
        assistantQuestion: "경쟁사 제안 (선택)",
        userAnswer: "경쟁사는 초기 3개월 50% 할인과 무료 마이그레이션 제공",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "30~49세 PM, 마케터, 데이터 담당자",
    interpretationGoal: "가격보다 사용률 낮은 기능이 이탈 명분이 되는지 확인",
  },
  {
    id: "churn-03-ott-content",
    simulationType: "churn_prediction",
    title: "OTT 콘텐츠 종료 이탈 위험",
    userIntent: "인기 콘텐츠 종료 후 해지 가능성 확인",
    userRole: "OTT 리텐션 매니저",
    firstMessage: "인기 드라마 시즌이 끝난 뒤 OTT 해지가 얼마나 생길지 보고 싶어요.",
    turns: [
      {
        stepId: "service",
        assistantQuestion: "서비스명?",
        userAnswer: "K-content OTT 월 구독",
      },
      {
        stepId: "current",
        assistantQuestion: "현재 상황을 적어주세요.",
        userAnswer: "월 12,900원으로 한국 오리지널 드라마와 예능을 보고 있으며 최근 인기 드라마 때문에 가입한 상황",
      },
      {
        stepId: "trigger",
        assistantQuestion: "이탈 유발 이벤트는?",
        userAnswer: "인기 드라마 시즌이 종료되고 다음 기대작 공개까지 2개월 공백 발생",
      },
      {
        stepId: "competitor",
        assistantQuestion: "경쟁사 제안 (선택)",
        userAnswer: "경쟁 OTT가 신규 예능과 3개월 30% 할인 프로모션 제공",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "20~39세 OTT 이용자",
    interpretationGoal: "콘텐츠 공백기에 할인, 추천, 가족 공유 중 어떤 유지 훅이 강한지 확인",
  },
  {
    id: "churn-04-fitness-app",
    simulationType: "churn_prediction",
    title: "피트니스 앱 휴면 이탈",
    userIntent: "운동앱 결제 후 사용량 감소 시 이탈 요인 확인",
    userRole: "헬스케어 앱 CRM 담당자",
    firstMessage: "운동앱 구독자가 점점 안 쓰다가 해지하는 상황을 분석하고 싶어요.",
    turns: [
      {
        stepId: "service",
        assistantQuestion: "서비스명?",
        userAnswer: "홈트레이닝 구독 앱",
      },
      {
        stepId: "current",
        assistantQuestion: "현재 상황을 적어주세요.",
        userAnswer: "월 19,900원으로 AI 운동 루틴과 식단 기록을 제공하지만 최근 4주간 운동 기록이 절반 이하로 줄어듦",
      },
      {
        stepId: "trigger",
        assistantQuestion: "이탈 유발 이벤트는?",
        userAnswer: "무료 체험 종료 후 첫 유료 결제 알림이 발송됨",
      },
      {
        stepId: "competitor",
        assistantQuestion: "경쟁사 제안 (선택)",
        userAnswer: "유튜브 무료 홈트 콘텐츠와 저가 PT 앱",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "20~44세 / 운동 관심층",
    interpretationGoal: "가격보다 실패감과 습관 형성 실패가 이탈을 만드는지 확인",
  },
  {
    id: "churn-05-delivery-membership",
    simulationType: "churn_prediction",
    title: "배달 멤버십 해지 위험",
    userIntent: "멤버십 혜택 축소 후 해지 위험 확인",
    userRole: "플랫폼 리텐션 담당자",
    firstMessage: "배달 멤버십 혜택을 줄이면 해지 위험이 얼마나 될지 보고 싶어요.",
    turns: [
      {
        stepId: "service",
        assistantQuestion: "서비스명?",
        userAnswer: "배달비 캐시백 멤버십",
      },
      {
        stepId: "current",
        assistantQuestion: "현재 상황을 적어주세요.",
        userAnswer: "월 4,900원 멤버십으로 배달비 일부 캐시백과 쿠폰을 제공하며 월 5회 이상 주문자에게 인기가 있음",
      },
      {
        stepId: "trigger",
        assistantQuestion: "이탈 유발 이벤트는?",
        userAnswer: "캐시백 한도가 월 12,000원에서 7,000원으로 축소됨",
      },
      {
        stepId: "competitor",
        assistantQuestion: "경쟁사 제안 (선택)",
        userAnswer: "경쟁 서비스가 첫 3개월 무료와 무료배송 쿠폰 제공",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "300명 (표준)",
      },
    ],
    advancedAnswer: "25~45세 / 서울 / 배달앱 월 4회 이상 이용자",
    interpretationGoal: "혜택 축소를 상쇄할 유지 메시지와 위험 세그먼트 확인",
  },
  {
    id: "campaign-01-vegan-sunscreen",
    simulationType: "campaign_strategy",
    title: "비건 선케어 캠페인 전략",
    userIntent: "채널과 메시지 조합별 반응 비교",
    userRole: "뷰티 퍼포먼스 마케터",
    firstMessage: "비건 선크림 캠페인을 어떤 채널과 메시지로 가야 할지 보고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트는?",
        userAnswer: "민감성 피부를 위한 비건 선케어, 백탁이 적고 가벼운 사용감 강조",
      },
      {
        stepId: "channels",
        assistantQuestion: "채널을 줄당 1개로 적어주세요.",
        userAnswer: "인스타그램\n네이버 검색\n올리브영 앱\n유튜브 쇼츠",
      },
      {
        stepId: "messages",
        assistantQuestion: "메시지를 줄당 1개로 적어주세요.",
        userAnswer: "민감한 피부도 매일 쓰는 저자극 비건 선케어\n백탁 없이 가볍게 밀착되는 데일리 선크림\n재구매 후기로 확인한 여름 필수 선케어",
      },
      {
        stepId: "budget",
        assistantQuestion: "예산은?",
        userAnswer: "80,000,000원",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~39세 여성 / 서울 경기",
    interpretationGoal: "성분안심, 사용감, 후기검증 메시지와 채널의 궁합 확인",
  },
  {
    id: "campaign-02-ai-saas",
    simulationType: "campaign_strategy",
    title: "B2B AI SaaS 캠페인 전략",
    userIntent: "B2B 리드 획득 채널과 메시지 조합 결정",
    userRole: "SaaS 그로스 리드",
    firstMessage: "AI 리서치 SaaS 캠페인 채널과 메시지를 조합해서 보고 싶습니다.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트는?",
        userAnswer: "고객 인터뷰와 리뷰를 자동 분석해 의사결정 보고서를 만드는 B2B AI SaaS",
      },
      {
        stepId: "channels",
        assistantQuestion: "채널을 줄당 1개로 적어주세요.",
        userAnswer: "링크드인 광고\n네이버 검색\n스타트업 뉴스레터\n웨비나",
      },
      {
        stepId: "messages",
        assistantQuestion: "메시지를 줄당 1개로 적어주세요.",
        userAnswer: "고객의 목소리를 10분 만에 보고서로\n리서처 없이 매주 쌓이는 고객 인사이트\n한국어 비정형 데이터에 최적화된 AI 분석",
      },
      {
        stepId: "budget",
        assistantQuestion: "예산은?",
        userAnswer: "30,000,000원",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "30~49세 PM, 마케터, 리서처",
    interpretationGoal: "직무별로 검색형 수요와 교육형 수요가 다른지 확인",
  },
  {
    id: "campaign-03-healthy-snack",
    simulationType: "campaign_strategy",
    title: "고단백바 출시 캠페인",
    userIntent: "편의점 신제품 캠페인 메시지/채널 결정",
    userRole: "CPG 마케터",
    firstMessage: "고단백바 출시 캠페인 조합을 테스트해보고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트는?",
        userAnswer: "저당 고단백 초코바, 단백질 18g, 당류 2g, 편의점 판매",
      },
      {
        stepId: "channels",
        assistantQuestion: "채널을 줄당 1개로 적어주세요.",
        userAnswer: "인스타그램\n편의점 앱\n네이버 검색\n헬스장 제휴 포스터",
      },
      {
        stepId: "messages",
        assistantQuestion: "메시지를 줄당 1개로 적어주세요.",
        userAnswer: "단백질은 채우고 당은 낮춘 오후 간식\n운동 후에도 부담 없는 고단백바\n초콜릿 맛은 그대로, 당 걱정은 줄인 건강 간식",
      },
      {
        stepId: "budget",
        assistantQuestion: "예산은?",
        userAnswer: "50,000,000원",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~39세 운동, 다이어트 관심층",
    interpretationGoal: "편의점 앱과 헬스장 맥락에서 다른 메시지가 필요한지 확인",
  },
  {
    id: "campaign-04-family-ott",
    simulationType: "campaign_strategy",
    title: "K-content OTT 가입 캠페인",
    userIntent: "신규 OTT 가입 캠페인 전략 결정",
    userRole: "OTT 마케팅 담당자",
    firstMessage: "새 OTT 가입 캠페인을 어떤 채널/메시지로 할지 시뮬레이션하고 싶습니다.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트는?",
        userAnswer: "한국 오리지널 콘텐츠 선공개와 가족 프로필을 강조하는 월 구독 OTT",
      },
      {
        stepId: "channels",
        assistantQuestion: "채널을 줄당 1개로 적어주세요.",
        userAnswer: "유튜브 프리롤\n인스타그램\n네이버 검색\n카카오톡 채널",
      },
      {
        stepId: "messages",
        assistantQuestion: "메시지를 줄당 1개로 적어주세요.",
        userAnswer: "오직 여기서만 먼저 보는 한국 오리지널 시리즈\n월 구독료 하나로 가족 모두의 K-content 취향 충족\nAI가 명장면을 바로 찾아 이어보는 OTT",
      },
      {
        stepId: "budget",
        assistantQuestion: "예산은?",
        userAnswer: "120,000,000원",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "20~39세 OTT 이용자",
    interpretationGoal: "독점 콘텐츠와 가족 경제성 메시지의 채널별 적합성 확인",
  },
  {
    id: "campaign-05-career-platform",
    simulationType: "campaign_strategy",
    title: "커리어 플랫폼 캠페인 전략",
    userIntent: "잠재 이직자를 설득할 채널/메시지 결정",
    userRole: "HR 플랫폼 그로스 담당자",
    firstMessage: "커리어 플랫폼 캠페인을 잠재 이직자 대상으로 돌리려는데 조합을 보고 싶어요.",
    turns: [
      {
        stepId: "context",
        assistantQuestion: "제품 컨텍스트는?",
        userAnswer: "이직 의사가 있는 직장인에게 맞춤 공고와 연봉 정보, 커리어 코칭을 제공하는 플랫폼",
      },
      {
        stepId: "channels",
        assistantQuestion: "채널을 줄당 1개로 적어주세요.",
        userAnswer: "링크드인\n인스타그램\n네이버 검색\n직장인 뉴스레터",
      },
      {
        stepId: "messages",
        assistantQuestion: "메시지를 줄당 1개로 적어주세요.",
        userAnswer: "내 경력에 맞는 이직 기회만 골라 받기\n연봉과 성장 가능성까지 비교하고 지원하세요\n지금 당장 이직하지 않아도 커리어 선택지를 넓히세요",
      },
      {
        stepId: "budget",
        assistantQuestion: "예산은?",
        userAnswer: "40,000,000원",
      },
      {
        stepId: "sample_size",
        assistantQuestion: "샘플 크기는?",
        userAnswer: "200명 (표준)",
      },
    ],
    advancedAnswer: "25~44세 직장인 / 개발, 마케팅, 기획 직군",
    interpretationGoal: "적극 이직자와 잠재 이직자에게 맞는 채널 메시지 분리",
  },
];

export const chatScenarioCountsBySimulation = chatScenarioFixtures.reduce(
  (counts, scenario) => ({
    ...counts,
    [scenario.simulationType]: (counts[scenario.simulationType] ?? 0) + 1,
  }),
  {} as Record<SimulationType, number>,
);
