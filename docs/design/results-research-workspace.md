---
title: Results Research Workspace
type: design-doc
tags: [results, interview, followup, persistence, ux]
created: 2026-07-13
updated: 2026-07-13
status: approved
related: [[../execution/results-research-workspace-v1]], [[harness-engineering-controls]]
---

# Results Research Workspace

## Decision

결과 화면의 `해석 근거 발언`, `군중감`, `결과에서 다시 묻기`를 하나의 `응답 탐색 & 대화` 워크스페이스로 통합한다.

- 화면은 하나로 합치되 집단 후속질문과 개인 인터뷰의 실행 의미는 분리한다.
- 대상이 코호트이면 기존 follow-up fanout을 실행한다.
- 대상이 한 명이면 응답자별 영속 인터뷰 스레드에 질문과 답변을 누적한다.
- 같은 응답자를 다시 선택하면 기존 스레드를 이어가고, 다른 응답자를 선택하면 해당 스레드로 전환한다.
- 발언 중심/응답자 중심은 별도 페이지가 아니라 동일 raw result의 두 가지 탐색 뷰다.

## User Flow

```text
결과 근거/응답자 탐색
  -> 대상 선택
     -> 코호트: 집단 후속질문 -> 개별 답변에서 한 명 선택 가능
     -> 응답자: 기존 인터뷰 로드 또는 새 스레드 생성 -> 누적 대화
```

워크스페이스의 질문 입력기는 하나다. `대상`과 `맥락` 칩이 현재 실행 의미를 설명하며, 사용자가 인터뷰와 후속질문의 이름을 먼저 이해할 필요가 없도록 한다.

## Persistence Contract

### `interview_threads`

- `thread_id`, `user_id`, `project_id`, `run_id`
- `subject_uuid`, `subject_label`, `subject_meta`, `context_quote`
- `created_at`, `updated_at`
- 사용자·run·응답자 조합은 하나의 연속 스레드로 유지한다.

### `interview_messages`

- `message_id`, `thread_id`, `role`, `content`, `ordinal`
- provider/model 등 안전한 실행 메타데이터는 `metadata_json`에 저장한다.
- 원문 hidden prompt, credential, stack trace는 저장하지 않는다.

## API Contract

```text
GET  /api/projects/{project_id}/runs/{run_id}/interview-threads
POST /api/projects/{project_id}/runs/{run_id}/interview-threads
POST /api/projects/{project_id}/runs/{run_id}/interview-threads/{thread_id}/messages
```

기존 `/followup`과 `/interview`는 MCP/기존 클라이언트 호환을 위해 유지한다. 새 React 결과 화면은 영속 스레드 API를 사용한다.

## LLM Boundary

- 응답자는 run의 `raw_results`에 존재하는 실제 UUID로만 선택한다.
- 매 턴에는 같은 persona profile, 최초 근거 발언, 최근 대화 이력, 새 질문을 제공한다.
- 대화 이력은 서버에서 스레드 ID로 조회하며 브라우저가 임의로 전체 이력을 조립하지 않는다.
- Langfuse 정책은 기존과 동일하게 metadata-only를 유지한다.

## Responsive Layout

- Desktop: 왼쪽 탐색 목록 + 오른쪽 대화 패널.
- Tablet/mobile: 탐색과 대화를 세로로 배치하고 입력기를 패널 하단에 유지한다.
- 발언/응답자 전환, 코호트 필터, 현재 대상이 키보드와 스크린리더에서 구분되어야 한다.

## Known Boundary

V1은 개인 인터뷰를 영속화한다. 집단 후속질문 결과는 현재 페이지 세션에 표시하며, 향후 별도 research session으로 승격할 수 있다. 두 기능을 하나의 범용 LLM thread로 성급하게 합치지 않는다.
