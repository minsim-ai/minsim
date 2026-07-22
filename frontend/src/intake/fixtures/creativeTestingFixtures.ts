import type { IntakeEvaluationFixture } from "./types";

export const creativeTestingFixtures: IntakeEvaluationFixture[] = [
  {
    id: "creative-goal-only-headline",
    title: "목표만 말하면 제품 질문",
    events: [
      { type: "user_message", content: "제 상품 상세페이지 헤드라인을 만들고 싶어요." },
    ],
    expectedAction: "ask_question",
    expectedSimulationType: "creative_testing",
    expectedSlotIds: ["product_description"],
  },
  {
    id: "creative-product-no-audience",
    title: "제품 설명 후 compact form",
    events: [
      { type: "user_message", content: "상세페이지 헤드라인을 만들고 싶어요." },
      { type: "user_message", content: "블로그를 작성하는 소프트웨어예요. 윈도우 프로그램이고요." },
    ],
    expectedAction: "show_form",
    expectedSimulationType: "creative_testing",
  },
  {
    id: "creative-partial-form-generates-candidates",
    title: "핵심 고객 1개만 입력하면 후보 생성",
    events: [
      { type: "user_message", content: "상세페이지 헤드라인을 만들고 싶어요." },
      { type: "user_message", content: "블로그를 작성하는 소프트웨어예요. 윈도우 프로그램이고요." },
      {
        type: "form_submit",
        values: {
          target_customers: ["네이버 블로그로 마케팅하는 소상공인"],
          tone: "전환 중심",
        },
      },
    ],
    expectedAction: "candidate_review",
    expectedSimulationType: "creative_testing",
    minCandidates: 3,
    maxCandidates: 5,
  },
  {
    id: "creative-existing-three-headlines",
    title: "후보 3개를 직접 주면 실행 준비",
    events: [
      { type: "user_message", content: "블로그 작성 프로그램 상세페이지 헤드라인을 비교하고 싶어요." },
      {
        type: "user_message",
        content: "블로그 글쓰기, 이제 초안부터 발행까지 한 번에\n소상공인을 위한 검색 노출형 블로그 작성 프로그램\n글감 고민 없이 윈도우에서 완성하는 마케팅 블로그",
      },
    ],
    expectedAction: "run_ready",
    expectedSimulationType: "creative_testing",
  },
  {
    id: "creative-candidate-accept-run-ready",
    title: "생성 후보를 수락하면 실행 준비",
    events: [
      { type: "user_message", content: "상세페이지 헤드라인을 만들고 싶어요." },
      { type: "user_message", content: "블로그를 작성하는 소프트웨어예요. 윈도우 프로그램이고요." },
      {
        type: "form_submit",
        values: {
          target_customers: ["네이버 블로그로 마케팅하는 소상공인"],
          main_benefit: "블로그 작성 시간을 줄이고 검색 유입용 글을 쉽게 만듭니다.",
        },
      },
      {
        type: "candidate_accept",
        candidates: [
          {
            id: "a",
            text: "블로그 글쓰기, 이제 초안부터 발행까지 한 번에",
            angle: "automation",
            why: "자동화 편익 강조",
            source: "generated",
          },
          {
            id: "b",
            text: "소상공인을 위한 검색 노출형 블로그 작성 프로그램",
            angle: "differentiation",
            why: "대상 고객 명확화",
            source: "generated",
          },
          {
            id: "c",
            text: "글감 고민 없이 바로 완성하는 마케팅 블로그",
            angle: "pain_relief",
            why: "글감 고민 해소",
            source: "generated",
          },
        ],
      },
    ],
    expectedAction: "run_ready",
    expectedSimulationType: "creative_testing",
  },
  {
    id: "creative-auto-generate",
    title: "알아서 카피 생성 요청",
    events: [
      { type: "user_message", content: "블로그 작성 윈도우 프로그램 광고 카피는 알아서 만들어줘." },
      {
        type: "form_submit",
        values: {
          target_customers: ["콘텐츠를 직접 쓰는 1인 사업자"],
        },
      },
    ],
    expectedAction: "candidate_review",
    expectedSimulationType: "creative_testing",
    minCandidates: 3,
    maxCandidates: 5,
  },
  {
    id: "creative-one-headline-only",
    title: "후보 1개만 있으면 repair",
    events: [
      { type: "user_message", content: "블로그 작성 프로그램 상세페이지 헤드라인을 비교하고 싶어요." },
      {
        type: "form_submit",
        values: {
          target_customers: ["네이버 블로그로 마케팅하는 소상공인"],
          creative_candidates: ["블로그 글쓰기, 이제 초안부터 발행까지 한 번에"],
        },
      },
    ],
    expectedAction: "repair_input",
    expectedSimulationType: "creative_testing",
  },
  {
    id: "creative-twelve-headlines",
    title: "후보 12개는 repair",
    events: [
      { type: "user_message", content: "블로그 작성 프로그램 상세페이지 헤드라인을 비교하고 싶어요." },
      {
        type: "form_submit",
        values: {
          target_customers: ["소상공인"],
          creative_candidates: Array.from({ length: 12 }, (_, index) => `후보 헤드라인 ${index + 1}`),
        },
      },
    ],
    expectedAction: "repair_input",
    expectedSimulationType: "creative_testing",
  },
  {
    id: "creative-target-filter-parse",
    title: "서울 30대 여성 타겟이 payload에 반영",
    events: [
      {
        type: "user_message",
        content: "서울 30대 여성 대상으로 블로그 작성 프로그램 상세페이지 헤드라인을 비교하고 싶어요.",
      },
      {
        type: "user_message",
        content: "블로그 글쓰기, 이제 초안부터 발행까지 한 번에\n소상공인을 위한 검색 노출형 블로그 작성 프로그램\n글감 고민 없이 윈도우에서 완성하는 마케팅 블로그",
      },
    ],
    expectedAction: "run_ready",
    expectedSimulationType: "creative_testing",
  },
  {
    id: "creative-unsupported-image-adaptation",
    title: "이미지 광고 요청도 creative route로 시작",
    events: [
      { type: "user_message", content: "이미지 광고 문구를 테스트하고 싶어요." },
    ],
    expectedAction: "ask_question",
    expectedSimulationType: "creative_testing",
    expectedSlotIds: ["product_description"],
  },
  {
    id: "creative-form-skip-benefit",
    title: "장점을 비워도 후보 생성",
    events: [
      { type: "user_message", content: "상세페이지 헤드라인을 만들고 싶어요." },
      { type: "user_message", content: "블로그를 작성하는 윈도우 프로그램입니다." },
      {
        type: "form_submit",
        values: {
          target_customers: ["온라인 쇼핑몰 운영자"],
        },
      },
    ],
    expectedAction: "candidate_review",
    expectedSimulationType: "creative_testing",
    minCandidates: 3,
    maxCandidates: 5,
  },
  {
    id: "creative-final-payload",
    title: "최종 수락 payload",
    events: [
      { type: "user_message", content: "상세페이지 헤드라인을 만들고 싶어요." },
      { type: "user_message", content: "블로그를 작성하는 윈도우 프로그램입니다." },
      {
        type: "candidate_accept",
        candidates: [
          { id: "a", text: "블로그 글쓰기, 이제 초안부터 발행까지 한 번에", angle: "automation", why: "자동화", source: "generated" },
          { id: "b", text: "소상공인을 위한 검색 노출형 블로그 작성 프로그램", angle: "differentiation", why: "차별화", source: "generated" },
        ],
      },
    ],
    expectedAction: "run_ready",
    expectedSimulationType: "creative_testing",
  },
];
