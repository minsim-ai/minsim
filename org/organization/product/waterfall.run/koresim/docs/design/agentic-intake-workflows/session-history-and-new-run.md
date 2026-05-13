---
title: Agentic Intake Session History and New Simulation Flow
type: product-architecture-note
tags: [agentic-intake, chat-history, sqlite, cloudflare, auth]
created: 2026-05-05
updated: 2026-05-05
status: implemented-v1
---

# Agentic Intake Session History and New Simulation Flow

## Product Intent

When a user finishes reading a report and clicks `새 시뮬레이션`, `/app` must open as a clean workspace. The previous chat should not continue in the main input area.

The previous chat still has value as decision context, so it should remain available from a separate history surface. This separates two user intents:

- `새 시뮬레이션`: start clean.
- `최근 대화`: inspect or resume previous intake context.

## Screen Composition

`/app` keeps the existing structure:

- Left: simulation type shortcuts.
- Main top: quick-start presets.
- Main primary: goal-first intake chat.
- Main secondary: recent intake history.
- Main fallback: manual simulation input in a collapsed details panel.

The history surface is rendered inside the goal-first intake card as a compact `최근 대화` disclosure. It shows up to 8 recent database-backed chat histories with title, status, transcript preview, updated time, and a result shortcut when a run exists. Selecting one restores the saved snapshot into the active chat.

## Navigation Contract

Report header `새 시뮬레이션` navigates to:

```text
/app?new=1
```

The app consumes this flag, removes only the active intake pointer from local storage, then normalizes the URL back to `/app`. Stored sessions are not deleted.

Local storage keys:

- `koresim:lastIntakeSessionId`: active draft pointer only.
- `koresim:lastRunId`: recent run pointer; not used for intake restoration.

## Database Schema

No destructive migration is required. SQLite is the source of truth for both session metadata and chat messages. `snapshot_json` remains for exact planner restoration, but the visible history transcript is read from `intake_messages`, not reconstructed from a local browser cache.

```sql
CREATE TABLE IF NOT EXISTS intake_sessions (
  session_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  title TEXT,
  run_id TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (run_id)
);

CREATE TABLE IF NOT EXISTS intake_messages (
  message_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES intake_sessions (session_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_messages_session_ordinal
  ON intake_messages (session_id, ordinal);

CREATE TABLE IF NOT EXISTS intake_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES intake_sessions (session_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_events_session_created
  ON intake_events (session_id, created_at);
```

When a run starts from an intake session, `intake_sessions.run_id` is linked to the created run. The history card can therefore route directly to `/results?run_id=...`.

A future account migration should add `user_id` or equivalent tenant/account partitioning before this history is exposed to multiple users.

## API Contract

```text
POST /api/intake/sessions
PUT  /api/intake/sessions/{session_id}
GET  /api/intake/sessions/{session_id}
GET  /api/intake/sessions?limit=8
GET  /api/intake/history?limit=8
POST /api/intake/sessions/{session_id}/run
```

`GET /api/intake/history` returns newest chat histories first:

```json
{
  "items": [
    {
      "session_id": "intake-...",
      "status": "collecting",
      "title": "상세페이지 헤드라인을 만들고 싶어요",
      "run_id": "34d2a37b-...",
      "messages": [
        { "role": "assistant", "content": "어떤 결정을 돕고 싶으신가요?", "created_at": "..." },
        { "role": "user", "content": "상세페이지 헤드라인을 만들고 싶어요", "created_at": "..." }
      ],
      "created_at": "2026-05-05T...",
      "updated_at": "2026-05-05T..."
    }
  ]
}
```

## Cloudflare And Auth

No separate Cloudflare Tunnel route is needed. These APIs live under the same origin:

```text
arabesque.cc -> Cloudflare DNS/Tunnel -> localhost:8000 FastAPI
```

Production auth behavior:

- `/api/intake/*` is protected by the app-level auth middleware because it is an `/api/` route and is not in the public path allowlist.
- Cloudflare Access allowlist remains unused by product decision.
- Cloudflare Tunnel only needs to keep forwarding `arabesque.cc` to the FastAPI origin.

Operational checks after Mac Studio deploy:

- `GET https://arabesque.cc/api/intake/history` should return `401` when logged out.
- Logged-in users should see their session history after app-level account scoping is added.
- Current v1 does not yet scope sessions by user id; do not expose multi-user production history without adding a `user_id` column or equivalent account partition.

## V1 Limitations

- Session history is global to the SQLite DB, not yet user-scoped.
- History search/filtering is not implemented.
- Result linking is one run per intake session for v1.
