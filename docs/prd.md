---

title: KoreaSim — Product Requirements Document (PRD)  
type: prd  
version: 0.2  
tags: \[koresim, prd, product\]  
created: 2026-04-30  
updated: 2026-04-30  
status: draft  
related: \[\[CLAUDE\]\], \[\[functional/overview\]\], \[\[../../obsidian-org-knowledge/org/organization/wiki/aaru\]\]

---

# KoreaSim PRD v0.2

## 1\. 한 줄 요약

NVIDIA Nemotron-Personas-Korea(100만 한국 합성 페르소나) 기반의 **한국 특화 AI 시뮬레이션 플랫폼**.
제품·마케팅·정책을 출시 전에 **분 단위·저비용**으로 사전 검증하는 B2B SaaS.

## 2\. 비전

> **"미국 Aaru가 세계를 시뮬레이션한다면, KoreaSim은 한국을 가장 정확하게 시뮬레이션한다."**

기존 시장조사(수개월·수억 원) 전에 가설을 빠르게 검증하고 조사 설계를 보완한다. 한국 문화·언어·제도 네이티브.

## 3\. 문제 정의

### 3.1 시장 문제

*   한국 기업의 **시장조사 비용 부담**: 글로벌 리서치 1건 평균 6개월 + 5천만~5억 원
*   **출시 후 실패율 높음**: 신제품 70%가 출시 후 1년 내 실패
*   **세대·지역 격차 데이터 부족**: 5060/2030 격차, 수도권/지방 격차 정확히 반영하는 도구 없음

### 3.2 솔루션 갭 (Aaru가 못 하는 것)

*   Aaru는 **미국 인구조사 중심** — 한국 시장 케이스 전무
*   영어 LLM 기반으로 한국 문화 맥락(체면·위계·집단주의) 재현 불가
*   한국 의사결정 구조(대기업 PoC → 본도입, 공공기관 조달) 미대응
*   화이트글러브 전용(Accenture·EY 리셀러) — 한국 SMB 접근 불가

자세한 분석: \[\[../../obsidian-org-knowledge/org/organization/wiki/aaru\]\]

## 4\. 타겟 고객

### 4.1 우선 (1순위)

*   **대기업 마케팅·전략팀**: 삼성·현대·LG·CJ·SK
*   신제품 출시·광고 캠페인·가격 결정 사전 검증

### 4.2 차순위 (2순위)

*   **지자체·공공기관**: 정책 시뮬레이션 (행정안전부, 보건복지부, 지자체)
*   **정치 캠프**: 국회의원 선거 지역구 단위 메시지·여론 시뮬레이션
*   **컨설팅사**: 액센추어·EY·딜로이트 한국 지사

### 4.3 장기 (3순위)

*   **SMB·스타트업**: 셀프서비스 SaaS로 가격 진입장벽 낮춤
*   **K-콘텐츠 기업**: OTT, 음악, 영화 기획 단계 청중 반응

## 5\. 핵심 가치 제안

| 차원 | 기존 시장조사 | KoreaSim |
| --- | --- | --- |
| 시간 | 수개월 | 분~수십 분 |
| 비용 | 수천만~수억 원 | 1회 수백~수천 원 (LLM 호출 비용) |
| 샘플 | 1,000~3,000명 | 100만 합성 페르소나 풀에서 목적별 샘플링 |
| 반복성 | 1회성 | 무제한 반복 |
| 세분화 | 광역시도·연령대 | 시군구·연령·직업·교육·가족구조까지 |
| 한국 특화 | 수동 설계 필요 | 데이터 자체가 한국 인구 통계 |

## 6\. 제품 기능 (시뮬레이션 9종)

상세: \[\[functional/overview\]\]

| # | 기능 | 비즈니스 질문 | 우선순위 | 상태 |
| --- | --- | --- | --- | --- |
| 01 | \[\[functional/01-creative-testing | 크리에이티브 테스트\]\] | 어떤 광고 카피가 가장 효과적인가? | ★★★★★ |
| 02 | \[\[functional/02-price-optimization | 가격 최적화\]\] | 최적 가격대는 얼마인가? | ★★★★★ |
| 03 | \[\[functional/03-product-launch | 제품 출시 예측\]\] | 신제품 시장 반응은? | ★★★★ |
| 04 | \[\[functional/04-value-proposition | 가치 제안 테스트\]\] | 어떤 VP가 설득력 있는가? | ★★★★ |
| 05 | \[\[functional/05-market-segmentation | 시장 세분화\]\] | 어떤 타겟 세그먼트가 존재하는가? | ★★★ |
| 06 | \[\[functional/06-competitive-positioning | 경쟁적 포지셔닝\]\] | 우리는 경쟁사 대비 어디에 있는가? | ★★★ |
| 07 | \[\[functional/07-brand-perception | 브랜드 인지도 추적\]\] | 브랜드 이미지는 어떤가? | ★★ |
| 08 | \[\[functional/08-churn-prediction | 이탈 예측\]\] | 어떤 고객이 떠나려 하는가? | ★★ |
| 09 | \[\[functional/09-campaign-strategy | 캠페인 전략\]\] | 최적 채널·메시지 조합은? | ★★ |

## 7\. 비기능 요구사항

### 7.1 성능

*   100명 시뮬레이션 \< 5분 (gemma3:27b · M2 Studio 128GB · 동시 8요청)
*   500명 시뮬레이션 \< 30분
*   WebSocket 끊김 시 부분 결과 보존

### 7.2 보안

*   Cloudflare Access Email OTP로 화이트리스트 보호
*   개인정보 처리 없음 (페르소나는 합성 데이터)
*   run/result 데이터는 SQLite에 저장하되, 데모 운영 목적의 최소 보존 정책을 따른다.

### 7.2-1 안정성 (장기 호출·끊김 대응)
- SSE 일시 단절 후에도 완료된 부분 결과 유지 ([[phases/phase-2-stability]])
- 단일 LLM 호출 60초 timeout + 1회 retry
- 진행률 ETA 표시 (처리율 기반)
- 시뮬레이션 도중 새로고침 시 `run_id` 기반으로 마지막 상태 복원

### 7.3 정확도

*   모든 시뮬레이션 결과에 **신뢰도 표기**
*   "AI 시뮬레이션은 참고용, 실제 시장조사 대체 불가" 면책 명시
*   검증된 케이스(외부 설문 vs KoreaSim 결과) 페이지 별도

## 8\. 비즈니스 모델

### 8.1 가격 정책 (계획)

| 티어 | 월 가격 | 시뮬레이션 한도 | 타겟 |
| --- | --- | --- | --- |
| Free | ₩0 | 월 5회 (50명/회) | 평가·SMB |
| Basic | ₩300~500만 | 월 10회 (1,000명/회) | 중소기업 |
| Pro | ₩1,000~2,000만 | 월 50회 (10,000명/회) | 대기업 부서 |
| Enterprise | 협의 | 무제한 | 대기업 전사·정부 |

### 8.2 부가 수익

*   **Fine-tuning 컨설팅**: 고객 맞춤 페르소나 추가 학습
*   **데이터 기반 인사이트 API**: 원본/파생 데이터 재배포 정책 검토 후 제공
*   **White-label**: 지자체·정부용 브랜드 포팅
*   **시뮬레이션 컨설팅**: PoC 단계 수동 인사이트 도출

### 8.3 GTM (Go-to-Market)

1.  **Phase A**: 마케팅팀·지자체 PoC 무료 제공 (3~5개 레퍼런스 확보)
2.  **Phase B**: 검증된 사례 콘텐츠로 인바운드 영업
3.  **Phase C**: 컨설팅사 파트너십 (한국 액센추어·EY)

## 9\. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 데이터 처리 | Polars | 1.98GB Parquet 초고속 lazy scan |
| 데이터셋 | NVIDIA Nemotron-Personas-Korea | CC BY 4.0 공개, 100만 행, 한국 시군구·인구통계 |
| LLM 백엔드 | Ollama (로컬) → 추후 NVIDIA NIM | 로컬 무료 → 운영 시 클라우드 |
| 모델 | gemma3:27b | 한국어 양호, 16GB로 M2 Studio에서 빠름 |
| 프론트엔드 | React + Vite | 외부 데모용 polished UI, API 기반 확장성 |
| 백엔드 | FastAPI | React 정적 서빙 + run API + SSE |
| 내부 fallback | Streamlit | 운영자용 백업 UI, 외부 MVP 표면 아님 |
| 영속화 | SQLite | run 상태, event log, result 복원 |
| 외부 노출 | Cloudflare Tunnel | 무료, 영구 도메인, Access 인증 통합 |
| 인증 | Cloudflare Access (Email OTP) | 50명까지 무료, SSO 확장 가능 |
| 도메인 | arabesque.cc (Cloudflare) | apex domain으로 외부 데모 노출 |

## 10\. 마일스톤

| 마일스톤 | 산출물 | 시점 |
| --- | --- | --- |
| **M0**: 코어 엔진 + 첫 시뮬레이션 | Streamlit + Creative Testing 작동, React mock UI | ✅ 2026-04-29 완료 |
| **M1**: React+FastAPI 외부 데모 | arabesque.cc 영구 URL + Creative Testing API + SSE | 2026-05 |
| **M2**: 데모 콘텐츠 | 프리셋 3종 + 가이드 | 2026-05 |
| **M3**: 시뮬레이션 9종 완성 | 8개 추가 시뮬레이션 | 2026-06 |
| **M4**: 첫 고객 PoC | 대기업 1곳 + 지자체 1곳 | 2026-Q3 |
| **M5**: 유료 전환 | 첫 유료 계약 | 2026-Q4 |

## 11\. Out of Scope (이번 버전 안 함)

*   ❌ 실시간 다중 사용자 협업
*   ❌ 모바일 앱
*   ❌ 비한국 시장 (일본·동남아는 V2 검토)
*   ❌ 커스텀 페르소나 추가 (V2)
*   ❌ 시뮬레이션 결과 자동 PDF 리포트 (V1.5)

## 12\. 위험 및 한계

| 위험 | 대응 |
| --- | --- |
| 페르소나 = 실제 인간 행동 ≠ 100% | 면책 명시, 검증 케이스 공개 |
| LLM 응답 일관성 (같은 질문 다른 답) | temperature 0.3, 시드 고정 |
| 데이터 편향 (무직 36.7%) | 기본 필터로 무직 제외 옵션 |
| 한국어 LLM 품질 (gemma3 한계) | 추후 한국어 특화 모델 검토 (LLaMa-Bllossom 등) |
| Aaru가 한국 진출 | 데이터·문화 moat로 방어, 정부·공공 우선 진입 |

## 13\. 참고 자료

*   데이터셋: https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea
*   제품 개요: `README.md`
*   설계 문서: `docs/design/`
*   기능 명세: `docs/functional/`
