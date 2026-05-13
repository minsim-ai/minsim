---
title: Aaru — AI 인간 행동 시뮬레이션 경쟁사
type: entity
tags: [경쟁사, simulation, synthetic-human, B2B-SaaS, 미국]
created: 2026-04-29
updated: 2026-04-29
sources: [raw/external-research/aaru-homepage-2026.md]
related: [[KoreaSim]]
status: stable
---

# Aaru

**KoreaSim의 직접 경쟁사.** 미국 중심 AI 인간 행동 시뮬레이션 B2B SaaS.

## 기본 정보

| 항목 | 내용 |
|------|------|
| 설립 | 2024년 3월 |
| 본사 | 뉴욕시 |
| 팀 규모 | 약 37명 |
| 밸류에이션 | $1B (2025년 12월 Series A 기준 헤드라인) |
| 주요 투자자 | Redpoint Ventures, Accenture Ventures, General Catalyst, Felicis |
| 웹사이트 | aaru.com |

창업자: Cameron Fink (CEO, 창업 당시 18세), Ned Koh (President), John Kessler (CTO, 15세)

## 포지셔닝

> "Purpose-built systems for the decisions that matter most."
> "Act on evidence, not instinct."

전통 시장조사(수개월·고비용)를 **분 단위·저비용** 시뮬레이션으로 대체하는 것이 핵심 가치 제안.

## 제품 3종

### Lumen — 기업용
타겟: 대기업 마케팅팀·전략팀

| 기능 |
|------|
| Creative testing |
| Product launches |
| Price optimization |
| Market segmentation |
| Value proposition testing |
| Churn prediction |
| Campaign strategy |
| Competitive positioning |
| Brand perception tracking |

### Seraph — 정부·공공용
타겟: 정부기관, 공공정책 담당자

| 기능 |
|------|
| Public communication |
| Crisis response |
| Regulatory shifts |
| Policy sequencing |
| Stakeholder sentiment modeling |
| Unreachable population modeling |
| Infrastructure rollout planning |

### Dynamo — 정치·선거용
타겟: 선거 캠프, 정치 조직

| 기능 |
|------|
| Election forecasting |
| Turnout modeling |
| Message testing |
| Opposition scenario planning |
| Endorsement impact |
| Ground game strategy |
| Narrative tracking |

## 실제 고객·사례

| 고객 | 내용 |
|------|------|
| EY | 글로벌 자산 연구(3,600명·30개국·6개월) → 1일 만에 재현. 높은 상관관계 |
| Accenture | Lumen을 자사 컨설팅에 통합. 전략 투자자이기도 함 |
| McDonald's | 마케팅/소비자 반응 테스트 |
| Bayer | 광고 슬로건·크리에이티브 테스트 |
| A24 | 콘텐츠/마케팅 검증 |
| Spindrift | 신제품 선정: 2개월 설문 → 1주일로 단축 |
| 뉴욕 민주당 경선 | 실제 투표 결과와 371표 차이로 예측 성공 |

## 기술 구조

- 다중 에이전트 시스템(multi-agent simulation)
- 행동 모델링(behavioral modeling) 기반
- 데이터 소스: 미국 인구조사, 노동통계, 금융기관 데이터, 소셜미디어 등 **미국 중심**
- LLM 백엔드 비공개 (독자 아키텍처 주장)

## 약점 (KoreaSim 차별화 포인트)

| 약점 | 상세 |
|------|------|
| 데이터 미국 중심 | 한국·아시아 공식통계 기반 페르소나 전무 |
| 한국 케이스 없음 | 공개 사례 전부 미국·서구 시장 |
| 화이트글러브 전용 | 가격 비공개, 셀프서비스 불가, SMB 접근 불가 |
| 문화 오류 위험 | 영어 LLM 기반으로 한국 문화 맥락(체면·위계·집단주의) 재현 불가 |
| 정확도 논란 | 일부 예측에서 역상관(-37.82%) 사례 보고 |
| 컨설팅사 의존 | Accenture·EY 리셀러 구조 → 자체 브랜드 인지도 부족 |

## KoreaSim과의 관계

KoreaSim은 Aaru의 **한국 특화 버전**으로 포지셔닝.
Aaru = 전 세계를 시뮬레이션 / KoreaSim = **한국을 가장 정확하게 시뮬레이션**

Aaru가 진입할 수 없는 공간:
- KOSIS·통계청 기반 100만 페르소나 (NVIDIA Nemotron-Personas-Korea)
- 한국어 네이티브 추론
- 개인정보보호법(PIPA) 완전 준수
- 공공기관 조달 자격
