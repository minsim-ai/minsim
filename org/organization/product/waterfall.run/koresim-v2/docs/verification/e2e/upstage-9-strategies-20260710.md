# 브라우저 E2E — 9개 시뮬레이션 전략 (Upstage Solar)

- 일자: 2026-07-10
- LLM 백엔드: Upstage `solar-pro2` (`LLM_BACKEND=upstage`)
- 실행 방식: 격리 로컬 인스턴스 `scripts/run_local_upstage_e2e.py` (포트 8099, 인라인 실행, 임시 SQLite)
  — 프로덕션 Redis 큐/DB/launchd 서비스(:8000 API, RQ worker, tunnel)와 완전 분리
- 시나리오 정의: `docs/verification/simulation-test-scenarios.md`

## 결과 요약

9개 전략 모두 Upstage에서 실행 완료(파싱 실패 0), 리포트가 실 브라우저에서 오류 없이 렌더됨.
신규 "기회 / 리스크 통합 맵 + 주요 거부 요인" 섹션이 9개 전략 리포트에 모두 표시됨.

| 전략 | 실행 | 표본 | 브라우저 렌더 |
|---|---|---|---|
| 🎯 creative_testing | completed | 6 / 200(UI) | OK (기회·리스크 + 거부요인) |
| 💰 price_optimization | completed | 6 | OK |
| 🚀 product_launch | completed | 6 | OK |
| 💬 value_proposition | completed | 5 | OK |
| 🧩 market_segmentation | completed | 6 | OK |
| 🎲 competitive_positioning | completed | 6 | OK |
| 🏷️ brand_perception | completed | 6 | OK |
| 📉 churn_prediction | completed | 6 | OK |
| 📡 campaign_strategy | completed | 6 | OK |

## 실 UI 플로우 (브라우저)

`/app` → 새 프로젝트 → 유형 선택(9개 카드) → `creative_testing` 인테이크(목표 우선 대화, Upstage 플래너) →
동적 폼 입력 → 후보 4개 생성 → "시뮬레이션 시작" → 200명 실행 완료 → `/results` 렌더 확인.

- 200명 실 표본에서 주요 거부 요인이 키워드 기반 비율로 산출됨(예: 신뢰·효과 회의 7.1%, 사용·접근 장벽 1.2%).
- 기회·리스크 맵(연령 세그먼트 × 수용도/니즈/가격저항/신뢰우려/경쟁압력)과 스윗스팟(★) 정상 표시.
- 스크린샷: `/tmp/koresim_e2e_logs/opp_risk_200_clean.png` (세션 산출물)

## 코드 변경

- `src/config.py`, `src/llm/factory.py`: `LLM_BACKEND=upstage` (OpenAI 호환, `https://api.upstage.ai/v1`) 지원 추가.
- `tests/test_llm_factory_tracing.py`: upstage 백엔드 선택 케이스 추가(통과).
- `.env`: Upstage 설정 섹션(비밀키는 로컬 env로만).
- `scripts/run_local_upstage_e2e.py`: 격리 e2e 런처.
