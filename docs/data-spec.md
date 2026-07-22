---

title: 데이터 명세서 — Nemotron Personas (multi-country)  
type: data-spec  
tags: \[data, schema, nemotron\]  
created: 2026-04-30  
updated: 2026-07-16  
status: stable  
related: \[\[prd\]\], \[\[functional/overview\]\], \[\[execution/multi-country-personas-v1\]\]

---

# 데이터 명세서 — Nemotron Personas

## Multi-country layout (2026-07)

| country_id | Dataset | Language | Local path |
|---|---|---|---|
| `kr` | Nemotron-Personas-Korea | Korean | `data/personas/kr/nemotron_personas.parquet` |
| `us` | Nemotron-Personas-USA | American English | `data/personas/us/...` |
| `jp` | Nemotron-Personas-Japan | Japanese | `data/personas/jp/...` |
| `in` | Nemotron-Personas-India | Hindi + Indian English | `data/personas/in/...` |
| `br` | Nemotron-Personas-Brazil | Brazilian Portuguese | `data/personas/br/...` |
| `fr` | Nemotron-Personas-France | French | `data/personas/fr/...` |
| `sg` | Nemotron-Personas-Singapore | English | `data/personas/sg/...` |
| `vn` | Nemotron-Personas-Vietnam | Vietnamese | `data/personas/vn/...` |
| `sv` | Nemotron-Personas-El-Salvador | Salvadoran Spanish | `data/personas/sv/...` |
| `be` | Nemotron-Personas-Belgium | Multilingual | `data/personas/be/...` |

* Registry: `src/data/datasets.py`
* Download: `uv run python scripts/download_dataset.py --country all`
* Run API field: `country_id` (default `kr`)
* Env: `PERSONAS_DATA_DIR` (default `./data/personas`), legacy `PARQUET_PATH` still used as KR fallback

Geo fields are normalized at sample time so the engine always sees `province` / `district` even when the source uses `state` / `city`.

## 출처 (Korea reference)

*   **데이터셋**: [nvidia/Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea)
*   **라이선스**: CC BY 4.0 (상업 이용 가능, attribution 필요)
*   **크기**: 1,000,000 행 × 26 컬럼 = 1.98 GB (Parquet)
*   **기본 로컬 경로**: `data/personas/kr/nemotron_personas.parquet` (legacy: `data/nemotron_korea_personas.parquet` / `PARQUET_PATH`)

---

## 26개 필드 사전

### 식별자 (1)

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `uuid` | String | 페르소나 고유 ID |

### 인구통계 (12)

| 필드                | 타입     | 값 예시                                                | 분포 (상위)                        |
| ----------------- | ------ | --------------------------------------------------- | ------------------------------ |
| `sex`             | String | 남자 / 여자                                             | 남자 49.6%, 여자 50.4%             |
| `age`             | Int64  | 19~99                                               | 평균 50.66, 중앙값 51               |
| `marital_status`  | String | 미혼 / 배우자 있음 / 이혼 / 사별                               | —                              |
| `military_status` | String | 군필 / 미필 / 면제 / 해당 없음                                | —                              |
| `family_type`     | String | 혼자 거주 / 배우자와 거주 / 자녀와 거주 등                          | —                              |
| `housing_type`    | String | 아파트 / 단독주택 / 빌라 / 오피스텔 등                            | —                              |
| `education_level` | String | 무학 / 초등학교 / 중학교 / 고등학교 / 2~3년제 전문대학 / 4년제 대학교 / 대학원 | 고졸 33.1%, 4년제 27.1%            |
| `bachelors_field` | String | 전공 (예: 경영학, 컴퓨터공학)                                  | —                              |
| `occupation`      | String | 직업 (한국표준직업분류 기준)                                    | **무직 36.7%**, 건물 청소원 1.8%, ... |
| `district`        | String | 시군구 (예: "서울-강남구")                                   | —                              |
| `province`        | String | 광역시도 (17개)                                          | 경기 26.2%, 서울 18.5%, 부산 6.5%    |
| `country`         | String | 한국 (전부 동일)                                          | —                              |

### Persona Narrative (7) — 핵심 자산

각 페르소나마다 **7개의 다른 관점에서 작성된 한국어 narrative** (각 130~170자):

| 필드                     | 의미                     | 시뮬레이션 활용                |
| ---------------------- | ---------------------- | ----------------------- |
| `persona`              | 통합 인물 묘사 (가장 짧음, ~80자) | 모든 시뮬레이션 기본 포함          |
| `professional_persona` | 직업·일터에서의 모습            | marketing, b2b          |
| `family_persona`       | 가족·가정에서의 모습            | marketing, lifestyle    |
| `culinary_persona`     | 음식·식습관                 | marketing (식음료)         |
| `sports_persona`       | 운동·여가 활동               | lifestyle, sports brand |
| `arts_persona`         | 예술·문화 취향               | lifestyle, media        |
| `travel_persona`       | 여행·이동 패턴               | lifestyle, travel       |

### 추가 속성 (6)

| 필드                           | 타입     | 의미                  |
| ---------------------------- | ------ | ------------------- |
| `cultural_background`        | String | 문화·세대적 배경 narrative |
| `skills_and_expertise`       | String | 보유 기술 narrative     |
| `skills_and_expertise_list`  | String | 기술 리스트 (콤마 구분)      |
| `hobbies_and_interests`      | String | 취미·관심사 narrative    |
| `hobbies_and_interests_list` | String | 취미 리스트 (콤마 구분)      |
| `career_goals_and_ambitions` | String | 커리어 목표 narrative    |

---

## 분포 통계 (실제 측정값)

### Province (17개 시도)

```
경기:    262,154 (26.2%)
서울:    185,228 (18.5%)
부산:     65,285 ( 6.5%)
경상남:   62,416 ( 6.2%)
인천:     58,991 ( 5.9%)
전라북:   48,261 ( 4.8%)
경상북:   44,859 ( 4.5%)
전라남:   44,729 ( 4.5%)
강원:     37,549 ( 3.8%)
대구:     34,239 ( 3.4%)
충청북:   32,230 ( 3.2%)
충청남:   31,640 ( 3.2%)
대전:     28,646 ( 2.9%)
광주:     27,594 ( 2.8%)
울산:     21,317 ( 2.1%)
제주:     12,673 ( 1.3%)
세종:      6,933 ( 0.7%)
```

### Age 분포

```
평균:     50.66세
중앙값:   51세
표준편차: 17.61
최소:     19세 (성인만)
최대:     99세
사분위:   25%=36세, 75%=64세
```

### Education

```
고등학교:        33.1%
4년제 대학교:    27.1%
2~3년제 전문대학: 15.0%
중학교:           8.5%
초등학교:         8.1%
대학원:           5.4%
무학:             2.6%
```

### Sex

```
남자: 49.6%
여자: 50.4%
```

### Occupation (상위 10)

```
무직:                         36.7%  ⚠️ 매우 높음
건물 청소원:                   1.8%
건물 경비원:                   1.7%
경리 사무원:                   1.6%
사무 보조원:                   1.4%
그 외 판매원:                  1.0%
일반 택시 운전사:              0.9%
편의점 점원:                   0.9%
주방보조원:                    0.8%
영업 사원:                     0.8%
... (이후 long tail.. 많음)
```

---

## TargetFilter 인터페이스

`src/data/sampler.py`의 `TargetFilter` TypedDict:

```python
class TargetFilter(TypedDict, total=False):
    province: list[str]              # 예: ["서울", "경기"]
    age_min: int                     # 예: 25
    age_max: int                     # 예: 45
    sex: str                         # "남자" 또는 "여자"
    education_level: list[str]       # 예: ["4년제 대학교", "대학원"]
    occupation_keywords: list[str]   # 직업명 부분 매칭 (예: ["프로그래머", "엔지니어"])
    exclude_unemployed: bool         # True면 무직 제외
```

`PersonaSampler`는 `province` 또는 `district` 둘 다 지원한다 (이미 구현됨).
`district` 형식: `"광역시도-시군구"` (예: `"서울-강남구"`)

**시군구 사용 예시**:
- 강남 3구: `district=["서울-강남구", "서울-서초구", "서울-송파구"]`
- 부산 해운대: `district=["부산-해운대구"]`
- 광역시도 + 시군구 동시 사용 가능 (둘 다 적용됨, AND)

### 사용 권장 패턴

| 시뮬레이션 목적 | 권장 필터 |
| --- | --- |
| **소비재 마케팅** | `age_min=20, age_max=55, exclude_unemployed=True` |
| **고가 제품 (자동차·가전)** | `age_min=30, age_max=60, exclude_unemployed=True, education_level=["4년제 대학교","대학원"]` |
| **K-콘텐츠/OTT** | `age_min=18, age_max=45` |
| **금융/보험** | `age_min=35, age_max=65, exclude_unemployed=True` |
| **노년 타겟** | `age_min=60` |
| **공공정책** | 필터 없음 (전체 인구 반영) |
| **B2B** | `occupation_keywords=["관리자", "사무", "임원"], exclude_unemployed=True` |

---

## 데이터 사용 규칙

### 1\. **무직 36.7% 주의**

*   소비재 시뮬레이션은 거의 항상 `exclude_unemployed=True` 권장
*   정책·복지 시뮬레이션은 무직 포함 (실제 인구 반영)

### 2\. **샘플링 시드 고정**

*   동일 시뮬레이션 재실행 시 같은 페르소나 사용을 위해 `seed=42` 기본
*   필요 시 사용자가 변경 가능

### 3\. **개인정보 안 됨**

*   페르소나는 **합성 데이터** — 실제 인물 아님
*   그럼에도 마케팅·정치 목적 외 부적절한 사용 금지
*   의료·법률 시뮬레이션은 추가 검증 필요

### 4\. **편향 인지**

*   LLM이 페르소나로 응답하지만 **LLM 자체의 편향**도 영향
*   정치적 민감 주제는 결과 해석 시 신중

### 5\. **샘플 사이즈는 충분히**

*   너무 적으면(10명) 통계적 의미 없음 → 시각화 호도 위험
*   200명 미만 결과는 "트렌드 참고용"으로 표기

---

## 데이터 갱신

NVIDIA가 데이터셋 업데이트 시:

1.  `scripts/download_dataset.py` 재실행 (자동 덮어쓰기 안 됨, 기존 파일 삭제 필요)
2.  컬럼 변경 확인 (`scripts/explore_dataset.py`)
3.  변경된 컬럼이 있으면 이 문서 + `prompt_builder.py` + `sampler.py` 갱신
