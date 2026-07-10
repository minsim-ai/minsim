# Minsim V2 Full UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `koresim-v2` as the complete KoreaSim backend/infrastructure flow with a default minsim-style project, intake, loading, and result UX, while preserving the classic koresim UI.

**Architecture:** Keep FastAPI, SQLite, Redis/RQ, SSE, auth, quota, worker execution, and `RunResultEnvelope` as the source of truth. Add a project service layer that is shared by web APIs and the MCP endpoint, then add TypeScript React V2 screens that render live backend data through typed API clients and a result adapter.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, SQLite, Redis/RQ worker, pytest, React 19, TypeScript 6, Vite 8, CSS, EventSource/SSE, Streamable HTTP-style MCP JSON-RPC endpoint.

## Global Constraints

- Work only inside `/Users/qts/obsidian-org-knowledge/org/organization/product/waterfall.run/koresim-v2`.
- Do not edit or delete `/Users/qts/obsidian-org-knowledge/org/organization/product/waterfall.run/koresim`.
- Preserve existing FastAPI, SQLite, Redis/RQ, worker, Google OAuth, quota, SSE, run result envelope, admin, intake, and classic result behavior.
- Preserve existing koresim UI behind `/classic/app` and `/classic/results?run_id=...`.
- Make `/app`, `/projects`, and `/results?run_id=...` render the minsim-style V2 experience.
- Do not copy minsim's production architecture around `window.*` globals into `frontend/src`; reimplement the UX as typed React components.
- Project data is server-persisted and user-owned.
- MCP is integrated at `/mcp` on the same FastAPI origin and calls the same service layer as web APIs.
- MCP access requires an authenticated Google-compatible session in production; local development can use existing koresim test/local-dev auth.
- MCP HTTP auth must align with OAuth 2.1 protected-resource expectations: unauthenticated HTTP clients receive `401` plus `WWW-Authenticate` metadata, and authenticated calls carry user identity from the existing session/auth layer.
- Do not commit `.env`, OAuth secrets, cookies, SQLite runtime databases, build output, virtualenvs, or `node_modules`.
- Final verification gate is `uv run python scripts/verify.py`, plus frontend `npm run verify`.

---

## File Structure

Backend persistence:

- Modify `src/jobs/models.py`: add `ProjectRecord` and `ProjectRunRecord`.
- Modify `src/jobs/store.py`: create `projects` and `project_runs` tables; add project CRUD, archive, run association, and ownership helpers.
- Create `tests/test_project_store.py`: focused SQLite store coverage.

Backend services and API:

- Create `src/services/__init__.py`: package marker.
- Create `src/services/errors.py`: structured service exceptions.
- Create `src/services/run_service.py`: shared run creation and quota/queue logic currently embedded in `/api/runs`.
- Create `src/services/export_service.py`: shared redacted run export response builder.
- Create `src/services/project_service.py`: project CRUD, project-backed run creation, result/export/feedback/follow-up/interview authorization.
- Create `src/services/followup_service.py`: same-seed persona follow-up and interview helpers adapted from `../misim/backend/followup.py`.
- Modify `src/api/schemas.py`: add project, follow-up, interview, and MCP-facing API schemas.
- Modify `src/api/routes.py`: add `/api/projects/*`; refactor `/api/runs` to use `run_service`; expose project-scoped follow-up and interview routes.
- Modify `src/api/main.py`: include `/mcp` in authenticated app behavior and install MCP routes.
- Create `tests/test_project_api.py`: project web API and authorization tests.
- Create `tests/test_followup_service.py`: same-seed follow-up and interview tests with a fake LLM.

MCP:

- Create `src/mcp/__init__.py`: package marker.
- Create `src/mcp/schemas.py`: JSON-RPC request/response and tool definitions.
- Create `src/mcp/registry.py`: tool/resource/prompt registry independent of HTTP transport.
- Create `src/mcp/http.py`: FastAPI router mounted at `/mcp`.
- Create `tests/test_mcp_http.py`: auth, tool dispatch, resource dispatch, and prompt listing tests.

Frontend API and routing:

- Modify `frontend/src/types/api.ts`: add project/follow-up/interview types.
- Create `frontend/src/api/projects.ts`: typed `/api/projects/*` client.
- Modify `frontend/src/Root.tsx`: route V2 and classic pages.
- Create `frontend/src/v2/types.ts`: V2 local UI and adapter types.
- Create `frontend/src/v2/navigation.ts`: small route helpers.
- Create `frontend/src/v2/V2AppShell.tsx`: minsim-style frame.
- Create `frontend/src/v2/ProjectsPage.tsx`: project list and creation.
- Create `frontend/src/v2/ProjectDetailPage.tsx`: project context and run history.
- Create `frontend/src/v2/SimulationTypePage.tsx`: all nine simulation types.
- Create `frontend/src/v2/MinsimIntakeFlow.tsx`: minsim-style intake backed by existing intake planner.
- Create `frontend/src/v2/MinsimLoadingPage.tsx`: minsim-style loading backed by `useRunEvents`.
- Create `frontend/src/v2/MinsimResultsPage.tsx`: minsim-style result report.
- Create `frontend/src/v2/resultAdapter.ts`: `resultToMinsimView`.
- Create `frontend/src/v2/resultAdapterFixtures.ts`: representative adapter fixtures.
- Create `frontend/src/v2/resultAdapterFixtureCheck.ts`: fixture check used by npm.
- Create `frontend/scripts/check-minsim-result-fixtures.mjs`: Vite SSR fixture runner.
- Modify `frontend/package.json`: add `check:minsim` to `verify`.
- Modify `frontend/vite.config.ts`: proxy `/mcp` during local dev.
- Modify `frontend/src/styles.css`: add V2 minsim-style CSS names prefixed with `.wf-` or `.v2-`.

Documentation:

- Modify `README.md`: add `koresim-v2` V2 routes and MCP local test notes.
- Modify `docs/superpowers/specs/2026-07-10-minsim-v2-full-ux-design.md` only if execution discovers a spec drift that was already implemented differently and needs a written amendment.

---

### Task 1: Project Persistence

**Files:**
- Modify: `src/jobs/models.py`
- Modify: `src/jobs/store.py`
- Create: `tests/test_project_store.py`

**Interfaces:**
- Produces:
  - `ProjectRecord(project_id, user_id, name, description, product_context, features, prices, target_notes, alternatives, created_at, updated_at, archived_at)`
  - `ProjectRunRecord(project_id, run_id, derived_from_run_id, run_label, created_at)`
  - `SQLiteRunStore.create_project(...) -> ProjectRecord`
  - `SQLiteRunStore.list_projects(user_id: str, include_archived: bool = False) -> list[ProjectRecord]`
  - `SQLiteRunStore.get_project(project_id: str) -> ProjectRecord | None`
  - `SQLiteRunStore.update_project(...) -> ProjectRecord | None`
  - `SQLiteRunStore.archive_project(project_id: str, user_id: str) -> ProjectRecord | None`
  - `SQLiteRunStore.attach_project_run(...) -> ProjectRunRecord`
  - `SQLiteRunStore.list_project_runs(project_id: str, user_id: str, limit: int = 20) -> list[tuple[ProjectRunRecord, RunRecord]]`
  - `SQLiteRunStore.get_project_run(project_id: str, run_id: str) -> ProjectRunRecord | None`
  - `SQLiteRunStore.get_project_for_run(run_id: str) -> ProjectRecord | None`
  - `SQLiteRunStore.user_owns_run(user_id: str, run_id: str) -> bool`

- Consumes:
  - Existing `SQLiteRunStore.create_run(payload, run_id=None, user=None) -> RunRecord`
  - Existing `UserRecord`

- [ ] **Step 1: Write failing store tests**

Create `tests/test_project_store.py`:

```python
from src.api.schemas import RunCreateRequest
from src.jobs.store import SQLiteRunStore


def _user(store: SQLiteRunStore, suffix: str = "a"):
    return store.upsert_user_from_auth(
        {
            "id": f"google-{suffix}",
            "email": f"{suffix}@example.com",
            "name": f"User {suffix}",
            "provider": "google",
        }
    )


def _request() -> RunCreateRequest:
    return RunCreateRequest.model_validate(
        {
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A", "B"]},
            "sample_size": 3,
            "target_filter": {"province": ["Seoul"]},
            "seed": 123,
        }
    )


def test_project_crud_archive_and_json_fields(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    user = _user(store, "owner")

    project = store.create_project(
        user=user,
        name="Ony launch",
        description="Senior care product",
        product_context={"category": "care", "positioning": "family reassurance"},
        features=["daily check-in", "guardian alert"],
        prices=["29000", "49000"],
        target_notes="70+ seniors and family caregivers",
        alternatives=["phone call", "home visit"],
    )

    assert project.project_id
    assert project.user_id == user.user_id
    assert project.product_context["category"] == "care"
    assert project.features == ["daily check-in", "guardian alert"]
    assert project.archived_at is None

    updated = store.update_project(
        project.project_id,
        user_id=user.user_id,
        name="Ony launch v2",
        description="Updated",
        product_context={"category": "care", "positioning": "health"},
        features=["daily check-in"],
        prices=["39000"],
        target_notes="families",
        alternatives=["home visit"],
    )
    assert updated is not None
    assert updated.name == "Ony launch v2"
    assert updated.product_context["positioning"] == "health"

    assert [item.project_id for item in store.list_projects(user.user_id)] == [project.project_id]
    archived = store.archive_project(project.project_id, user.user_id)
    assert archived is not None
    assert archived.archived_at is not None
    assert store.list_projects(user.user_id) == []
    assert store.list_projects(user.user_id, include_archived=True)[0].project_id == project.project_id


def test_project_run_association_and_ownership(tmp_path) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    owner = _user(store, "owner")
    other = _user(store, "other")
    project = store.create_project(user=owner, name="Project")
    run = store.create_run(_request(), run_id="run-project-1", user=owner)

    link = store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=owner.user_id,
        derived_from_run_id=None,
        run_label="Baseline creative test",
    )

    assert link.project_id == project.project_id
    assert link.run_id == run.run_id
    assert store.user_owns_run(owner.user_id, run.run_id) is True
    assert store.user_owns_run(other.user_id, run.run_id) is False
    assert store.get_project_for_run(run.run_id).project_id == project.project_id

    listed = store.list_project_runs(project.project_id, owner.user_id)
    assert [(item.run_id, run_record.run_id) for item, run_record in listed] == [(run.run_id, run.run_id)]
    assert store.list_project_runs(project.project_id, other.user_id) == []
    assert store.attach_project_run(
        project_id=project.project_id,
        run_id=run.run_id,
        user_id=owner.user_id,
        derived_from_run_id=None,
        run_label="Baseline creative test",
    ).run_id == run.run_id
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
uv run pytest tests/test_project_store.py -q
```

Expected:

```text
FAILED tests/test_project_store.py::test_project_crud_archive_and_json_fields - AttributeError: 'SQLiteRunStore' object has no attribute 'create_project'
FAILED tests/test_project_store.py::test_project_run_association_and_ownership - AttributeError: 'SQLiteRunStore' object has no attribute 'create_project'
```

- [ ] **Step 3: Add project dataclasses**

In `src/jobs/models.py`, after `UserUsageRecord`, add:

```python
@dataclass(frozen=True)
class ProjectRecord:
    project_id: str
    user_id: str
    name: str
    description: str = ""
    product_context: dict[str, Any] = field(default_factory=dict)
    features: list[str] = field(default_factory=list)
    prices: list[str] = field(default_factory=list)
    target_notes: str = ""
    alternatives: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    archived_at: str | None = None


@dataclass(frozen=True)
class ProjectRunRecord:
    project_id: str
    run_id: str
    derived_from_run_id: str | None = None
    run_label: str | None = None
    created_at: str = ""
```

- [ ] **Step 4: Add project tables and imports**

In `src/jobs/store.py`, import the new dataclasses from `src.jobs.models`. Inside `init_db()` add this SQL after the `users` table/index block:

```sql
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    product_context_json TEXT NOT NULL DEFAULT '{}',
    features_json TEXT NOT NULL DEFAULT '[]',
    prices_json TEXT NOT NULL DEFAULT '[]',
    target_notes TEXT NOT NULL DEFAULT '',
    alternatives_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
    ON projects (user_id, updated_at);

CREATE TABLE IF NOT EXISTS project_runs (
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    derived_from_run_id TEXT,
    run_label TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, run_id),
    FOREIGN KEY (project_id) REFERENCES projects (project_id),
    FOREIGN KEY (run_id) REFERENCES runs (run_id)
);

CREATE INDEX IF NOT EXISTS idx_project_runs_project_created
    ON project_runs (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_project_runs_run
    ON project_runs (run_id);
```

- [ ] **Step 5: Add row conversion helpers**

In `src/jobs/store.py`, near `_row_to_run`, add:

```python
    def _row_to_project(self, row: sqlite3.Row) -> ProjectRecord:
        return ProjectRecord(
            project_id=str(row["project_id"]),
            user_id=str(row["user_id"]),
            name=str(row["name"]),
            description=str(row["description"] or ""),
            product_context=_json_loads(row["product_context_json"], {}),
            features=_json_loads(row["features_json"], []),
            prices=_json_loads(row["prices_json"], []),
            target_notes=str(row["target_notes"] or ""),
            alternatives=_json_loads(row["alternatives_json"], []),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            archived_at=row["archived_at"],
        )

    def _row_to_project_run(self, row: sqlite3.Row) -> ProjectRunRecord:
        return ProjectRunRecord(
            project_id=str(row["project_id"]),
            run_id=str(row["run_id"]),
            derived_from_run_id=row["derived_from_run_id"],
            run_label=row["run_label"],
            created_at=str(row["created_at"]),
        )
```

- [ ] **Step 6: Add store methods**

In `src/jobs/store.py`, add methods before `_row_to_run`. Use `INSERT OR IGNORE` for `attach_project_run` so retries are idempotent:

```python
    def create_project(
        self,
        *,
        user: UserRecord,
        name: str,
        description: str = "",
        product_context: dict[str, Any] | None = None,
        features: list[str] | None = None,
        prices: list[str] | None = None,
        target_notes: str = "",
        alternatives: list[str] | None = None,
        project_id: str | None = None,
    ) -> ProjectRecord:
        self.init_db()
        now = _utc_now()
        project_id = project_id or str(uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO projects (
                    project_id, user_id, name, description, product_context_json,
                    features_json, prices_json, target_notes, alternatives_json,
                    created_at, updated_at, archived_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    project_id,
                    user.user_id,
                    name.strip(),
                    description.strip(),
                    _json_dumps(product_context or {}),
                    _json_dumps(features or []),
                    _json_dumps(prices or []),
                    target_notes.strip(),
                    _json_dumps(alternatives or []),
                    now,
                    now,
                ),
            )
        project = self.get_project(project_id)
        if project is None:
            raise RuntimeError(f"Project was not persisted: {project_id}")
        return project

    def list_projects(self, user_id: str, include_archived: bool = False) -> list[ProjectRecord]:
        self.init_db()
        archived_clause = "" if include_archived else "AND archived_at IS NULL"
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM projects
                WHERE user_id = ? {archived_clause}
                ORDER BY updated_at DESC, created_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [self._row_to_project(row) for row in rows]

    def get_project(self, project_id: str) -> ProjectRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        return self._row_to_project(row) if row else None

    def update_project(
        self,
        project_id: str,
        *,
        user_id: str,
        name: str,
        description: str = "",
        product_context: dict[str, Any] | None = None,
        features: list[str] | None = None,
        prices: list[str] | None = None,
        target_notes: str = "",
        alternatives: list[str] | None = None,
    ) -> ProjectRecord | None:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE projects
                SET name = ?, description = ?, product_context_json = ?,
                    features_json = ?, prices_json = ?, target_notes = ?,
                    alternatives_json = ?, updated_at = ?
                WHERE project_id = ? AND user_id = ? AND archived_at IS NULL
                """,
                (
                    name.strip(),
                    description.strip(),
                    _json_dumps(product_context or {}),
                    _json_dumps(features or []),
                    _json_dumps(prices or []),
                    target_notes.strip(),
                    _json_dumps(alternatives or []),
                    now,
                    project_id,
                    user_id,
                ),
            )
        return self.get_project(project_id)

    def archive_project(self, project_id: str, user_id: str) -> ProjectRecord | None:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE projects
                SET archived_at = ?, updated_at = ?
                WHERE project_id = ? AND user_id = ? AND archived_at IS NULL
                """,
                (now, now, project_id, user_id),
            )
        return self.get_project(project_id)

    def attach_project_run(
        self,
        *,
        project_id: str,
        run_id: str,
        user_id: str,
        derived_from_run_id: str | None = None,
        run_label: str | None = None,
    ) -> ProjectRunRecord:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            project = conn.execute(
                "SELECT project_id FROM projects WHERE project_id = ? AND user_id = ? AND archived_at IS NULL",
                (project_id, user_id),
            ).fetchone()
            run = conn.execute(
                "SELECT run_id FROM runs WHERE run_id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
            if project is None or run is None:
                raise ValueError("Project and run must belong to the same user.")
            conn.execute(
                """
                INSERT OR IGNORE INTO project_runs (
                    project_id, run_id, derived_from_run_id, run_label, created_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (project_id, run_id, derived_from_run_id, run_label, now),
            )
            row = conn.execute(
                "SELECT * FROM project_runs WHERE project_id = ? AND run_id = ?",
                (project_id, run_id),
            ).fetchone()
        if row is None:
            raise RuntimeError(f"Project run link was not persisted: {project_id}/{run_id}")
        return self._row_to_project_run(row)

    def list_project_runs(
        self,
        project_id: str,
        user_id: str,
        *,
        limit: int = 20,
    ) -> list[tuple[ProjectRunRecord, RunRecord]]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT pr.project_id, pr.run_id, pr.derived_from_run_id, pr.run_label, pr.created_at AS link_created_at,
                       r.*
                FROM project_runs pr
                JOIN projects p ON p.project_id = pr.project_id
                JOIN runs r ON r.run_id = pr.run_id
                WHERE pr.project_id = ? AND p.user_id = ?
                ORDER BY pr.created_at DESC
                LIMIT ?
                """,
                (project_id, user_id, limit),
            ).fetchall()
        pairs: list[tuple[ProjectRunRecord, RunRecord]] = []
        for row in rows:
            link = ProjectRunRecord(
                project_id=str(row["project_id"]),
                run_id=str(row["run_id"]),
                derived_from_run_id=row["derived_from_run_id"],
                run_label=row["run_label"],
                created_at=str(row["link_created_at"]),
            )
            pairs.append((link, self._row_to_run(row)))
        return pairs

    def get_project_run(self, project_id: str, run_id: str) -> ProjectRunRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM project_runs WHERE project_id = ? AND run_id = ?",
                (project_id, run_id),
            ).fetchone()
        return self._row_to_project_run(row) if row else None

    def get_project_for_run(self, run_id: str) -> ProjectRecord | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT p.*
                FROM project_runs pr
                JOIN projects p ON p.project_id = pr.project_id
                WHERE pr.run_id = ?
                ORDER BY pr.created_at DESC
                LIMIT 1
                """,
                (run_id,),
            ).fetchone()
        return self._row_to_project(row) if row else None

    def user_owns_run(self, user_id: str, run_id: str) -> bool:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT run_id FROM runs WHERE run_id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
        return row is not None
```

- [ ] **Step 7: Run persistence tests**

Run:

```bash
uv run pytest tests/test_project_store.py tests/test_jobs_store.py -q
```

Expected:

```text
passed
```

- [ ] **Step 8: Commit**

```bash
git add src/jobs/models.py src/jobs/store.py tests/test_project_store.py
git commit -m "feat: add project persistence"
```

---

### Task 2: Project Service and Web API

**Files:**
- Create: `src/services/__init__.py`
- Create: `src/services/errors.py`
- Create: `src/services/run_service.py`
- Create: `src/services/export_service.py`
- Create: `src/services/project_service.py`
- Modify: `src/api/schemas.py`
- Modify: `src/api/routes.py`
- Create: `tests/test_project_api.py`

**Interfaces:**
- Consumes:
  - Task 1 `SQLiteRunStore` project methods.
  - Existing `_user_record_for_request(request) -> UserRecord | None`.
  - Existing `_enqueue_run(request) -> Callable[[str], str]`.
  - Existing export response behavior from `/api/runs/{run_id}/export`.

- Produces:
  - `ServiceError(status_code: int, code: ErrorCode | str, message: str, details: dict[str, Any] | None = None)`
  - `create_run_for_user(store, enqueue_run, payload, user, page) -> RunCreateResponse`
  - `ProjectService.list_projects(user) -> ProjectListResponse`
  - `ProjectService.create_project(user, payload) -> ProjectResponse`
  - `ProjectService.update_project(user, project_id, payload) -> ProjectResponse`
  - `ProjectService.archive_project(user, project_id) -> ProjectResponse`
  - `ProjectService.list_project_runs(user, project_id) -> ProjectRunListResponse`
  - `ProjectService.create_project_run(user, project_id, payload) -> ProjectRunCreateResponse`
  - FastAPI routes listed in the approved spec.

- [ ] **Step 1: Write failing API tests**

Create `tests/test_project_api.py`:

```python
from fastapi.testclient import TestClient

from src.api.main import create_app
from src.jobs.store import SQLiteRunStore


def _login(client: TestClient, monkeypatch, email: str) -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", email)
    response = client.get("/api/auth/test-login", follow_redirects=False)
    assert response.status_code == 303


def test_project_api_crud_and_archive(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: f"job-{run_id}"))
    _login(client, monkeypatch, "owner@example.com")

    created = client.post(
        "/api/projects",
        json={
            "name": "Ony",
            "description": "Care product",
            "product_context": {"category": "care"},
            "features": ["check-in"],
            "prices": ["29000"],
            "target_notes": "70+ seniors",
            "alternatives": ["phone call"],
        },
    )

    assert created.status_code == 200
    project = created.json()
    assert project["name"] == "Ony"
    assert project["product_context"]["category"] == "care"

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert [item["project_id"] for item in listed.json()["projects"]] == [project["project_id"]]

    patched = client.patch(
        f"/api/projects/{project['project_id']}",
        json={
            "name": "Ony v2",
            "description": "Updated",
            "product_context": {"category": "care", "positioning": "family"},
            "features": ["check-in", "alert"],
            "prices": ["39000"],
            "target_notes": "family caregivers",
            "alternatives": ["home visit"],
        },
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Ony v2"

    archived = client.post(f"/api/projects/{project['project_id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert client.get("/api/projects").json()["projects"] == []


def test_project_api_scopes_projects_to_authenticated_user(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    first = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-1"))
    _login(first, monkeypatch, "first@example.com")
    created = first.post("/api/projects", json={"name": "Private project"})
    project_id = created.json()["project_id"]

    second = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: "job-2"))
    _login(second, monkeypatch, "second@example.com")
    assert second.get(f"/api/projects/{project_id}").status_code == 404
    assert second.patch(f"/api/projects/{project_id}", json={"name": "Stolen"}).status_code == 404
    assert second.post(f"/api/projects/{project_id}/archive").status_code == 404


def test_project_run_creation_wraps_existing_run_creation(tmp_path, monkeypatch) -> None:
    store = SQLiteRunStore(tmp_path / "runs.sqlite3")
    enqueued: list[str] = []
    client = TestClient(create_app(store=store, enqueue_run_func=lambda run_id: enqueued.append(run_id) or f"job-{run_id}"))
    _login(client, monkeypatch, "owner@example.com")
    project = client.post(
        "/api/projects",
        json={
            "name": "Launch",
            "product_context": {"product_description": "AI research SaaS"},
            "features": ["Korean persona simulation"],
            "prices": ["99000"],
        },
    ).json()

    response = client.post(
        f"/api/projects/{project['project_id']}/runs",
        json={
            "run_label": "Message test",
            "simulation_type": "creative_testing",
            "input": {"creatives": ["A copy", "B copy"]},
            "sample_size": 3,
            "target_filter": {"province": ["Seoul"]},
            "seed": 42,
            "intake_context": {
                "schema_version": "intake-context/v1",
                "intake_session_id": "intake-project-1",
                "router_version": "goal-router:v1",
                "planner_version": "intake-planner:v2-20260513",
                "task_frame": {},
                "provenance": {},
                "safe_intake_summary": {
                    "schema_version": "safe-intake-summary/v1",
                    "user_goal": "카피 비교",
                    "decision_question": "어떤 카피가 더 좋은가?",
                    "simulation_type": "creative_testing",
                    "user_provided": {},
                    "inferred": {},
                    "generated": {},
                    "defaults": {},
                    "reviewed_assumptions": {},
                    "generated_candidates": ["A copy", "B copy"],
                    "constraints": {},
                    "source_counts": {"user": 0, "inferred": 0, "generated": 0, "default": 0},
                    "unreviewed_assumption_count": 0,
                },
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == project["project_id"]
    assert body["run"]["status"] == "queued"
    assert enqueued == [body["run"]["run_id"]]

    runs = client.get(f"/api/projects/{project['project_id']}/runs")
    assert runs.status_code == 200
    assert runs.json()["runs"][0]["run"]["run_id"] == body["run"]["run_id"]
```

- [ ] **Step 2: Run the failing API tests**

Run:

```bash
uv run pytest tests/test_project_api.py -q
```

Expected:

```text
FAILED tests/test_project_api.py::test_project_api_crud_and_archive - assert 404 == 200
FAILED tests/test_project_api.py::test_project_api_scopes_projects_to_authenticated_user - assert 404 == 200
FAILED tests/test_project_api.py::test_project_run_creation_wraps_existing_run_creation - assert 404 == 200
```

- [ ] **Step 3: Add service errors**

Create `src/services/__init__.py`:

```python
"""Shared application services for web APIs and MCP."""
```

Create `src/services/errors.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.api.schemas import ErrorCode


@dataclass
class ServiceError(Exception):
    status_code: int
    code: ErrorCode | str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def require_authenticated_user(user: Any | None) -> Any:
    if user is None:
        raise ServiceError(
            status_code=401,
            code="AUTH_REQUIRED",
            message="Login is required.",
        )
    return user
```

- [ ] **Step 4: Move run creation logic into a service**

Create `src/services/run_service.py`. Keep this module independent from `src.api.routes` so the route layer can import it without a circular import:

```python
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import UTC, datetime

from src.api.schemas import ErrorCode, ErrorResponse, RunCreateRequest, RunCreateResponse, RunStatus, SimulationType
from src.jobs.models import RunEventType, RunStatusValue, UserRecord
from src.jobs.store import SQLiteRunStore
from src.services.errors import ServiceError


def create_run_for_user(
    *,
    store: SQLiteRunStore,
    enqueue_run: Callable[[str], str],
    payload: RunCreateRequest,
    user: UserRecord | None,
    page: str,
) -> RunCreateResponse:
    bypass_quota = bool(user and _quota_bypass(user.email))
    if user and not bypass_quota:
        usage = store.get_user_usage(user.user_id)
        if not usage.can_create_run:
            raise ServiceError(
                status_code=403,
                code=ErrorCode.FREE_QUOTA_EXHAUSTED,
                message="무료 실행 5회를 모두 사용했습니다.",
                details={
                    "free_run_limit": usage.free_run_limit,
                    "used_runs": usage.used_runs,
                    "remaining_runs": usage.remaining_runs,
                },
            )

    run = store.create_run(payload, user=user)
    store.record_analytics_event(
        event_name="run_created",
        user=user,
        run_id=run.run_id,
        page=page,
        simulation_type=payload.simulation_type.value,
        payload={
            "sample_size": payload.sample_size,
            "has_intake_context": payload.intake_context is not None,
        },
    )
    try:
        job_id = enqueue_run(run.run_id)
        store.append_event(run.run_id, RunEventType.QUEUED, {"job_id": job_id})
    except Exception as exc:
        error = ErrorResponse(
            code=ErrorCode.QUEUE_UNAVAILABLE,
            message="Run was persisted, but the worker queue is unavailable.",
            details={"run_id": run.run_id, "error": str(exc)},
        )
        store.update_run_status(
            run.run_id,
            RunStatusValue.FAILED,
            completed_at=_utc_now(),
            error=error.model_dump(mode="json"),
        )
        raise ServiceError(
            status_code=503,
            code=ErrorCode.QUEUE_UNAVAILABLE,
            message=error.message,
            details=error.details,
        ) from exc

    return RunCreateResponse(
        run_id=run.run_id,
        status=RunStatus.QUEUED,
        simulation_type=SimulationType(run.simulation_type),
        events_url=f"/api/runs/{run.run_id}/events",
        status_url=f"/api/runs/{run.run_id}",
        result_url=f"/api/runs/{run.run_id}/result",
    )


def _quota_bypass(email: str) -> bool:
    raw_values = [
        os.getenv("KORESIM_ADMIN_EMAILS", ""),
        os.getenv("KORESIM_QUOTA_BYPASS_EMAILS", ""),
    ]
    allowed = {
        item.strip().lower()
        for raw_value in raw_values
        for item in raw_value.split(",")
        if item.strip()
    }
    return email.strip().lower() in allowed


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
```

Then modify `src/api/routes.py` imports and replace the body of `create_run()` with:

```python
    try:
        return create_run_for_user(
            store=_store(request),
            enqueue_run=_enqueue_run(request),
            payload=payload,
            user=_user_record_for_request(request),
            page="/app",
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc
```

Add this helper near `_error`:

```python
def _service_error(exc: ServiceError) -> HTTPException:
    code = exc.code if isinstance(exc.code, ErrorCode) else ErrorCode.INTERNAL_ERROR
    return _error(
        exc.status_code,
        ErrorResponse(code=code, message=exc.message, details=exc.details),
    )
```

If `exc.code == "AUTH_REQUIRED"`, use `ErrorCode.INVALID_REQUEST` in the `ErrorResponse` and keep the HTTP status `401`.

- [ ] **Step 5: Add project API schemas**

In `src/api/schemas.py`, after `RunCreateResponse`, add:

```python
class ProjectCreateRequest(APIModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=800)
    product_context: dict[str, Any] = Field(default_factory=dict)
    features: list[str] = Field(default_factory=list, max_length=30)
    prices: list[str] = Field(default_factory=list, max_length=20)
    target_notes: str = Field(default="", max_length=1200)
    alternatives: list[str] = Field(default_factory=list, max_length=30)


class ProjectUpdateRequest(ProjectCreateRequest):
    pass


class ProjectResponse(APIModel):
    project_id: str
    user_id: str
    name: str
    description: str
    product_context: dict[str, Any]
    features: list[str]
    prices: list[str]
    target_notes: str
    alternatives: list[str]
    created_at: str
    updated_at: str
    archived_at: str | None = None


class ProjectListResponse(APIModel):
    projects: list[ProjectResponse]


class ProjectRunCreateRequest(RunCreateRequest):
    run_label: str | None = Field(default=None, max_length=160)
    derived_from_run_id: str | None = Field(default=None, max_length=160)


class ProjectRunItem(APIModel):
    project_id: str
    run_label: str | None = None
    derived_from_run_id: str | None = None
    created_at: str
    run: RunSnapshot


class ProjectRunListResponse(APIModel):
    project_id: str
    runs: list[ProjectRunItem]


class ProjectRunCreateResponse(APIModel):
    project_id: str
    run: RunCreateResponse
```

- [ ] **Step 6: Add project service**

Create `src/services/project_service.py`:

```python
from __future__ import annotations

from collections.abc import Callable

from src.api.schemas import (
    ErrorCode,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectRunCreateRequest,
    ProjectRunCreateResponse,
    ProjectRunItem,
    ProjectRunListResponse,
    ProjectUpdateRequest,
    RunCreateRequest,
    RunSnapshot,
)
from src.jobs.models import ProjectRecord, RunRecord, UserRecord
from src.jobs.store import SQLiteRunStore
from src.services.errors import ServiceError, require_authenticated_user
from src.services.run_service import create_run_for_user


def project_response(record: ProjectRecord) -> ProjectResponse:
    return ProjectResponse.model_validate(record.__dict__)


def snapshot_from_run(run: RunRecord, result_available: bool) -> RunSnapshot:
    progress = 100.0 if run.total_count <= 0 else round((run.done_count / run.total_count) * 100, 1)
    return RunSnapshot(
        run_id=run.run_id,
        simulation_type=run.simulation_type,
        status=run.status.value,
        sample_size=run.sample_size,
        done_count=run.done_count,
        total_count=run.total_count,
        progress_pct=max(0, min(100, progress)),
        created_at=run.created_at,
        started_at=run.started_at,
        updated_at=run.updated_at,
        completed_at=run.completed_at,
        error=run.error,
        result_available=result_available,
    )


class ProjectService:
    def __init__(self, store: SQLiteRunStore, enqueue_run: Callable[[str], str] | None = None) -> None:
        self.store = store
        self.enqueue_run = enqueue_run

    def list_projects(self, user: UserRecord | None) -> ProjectListResponse:
        user = require_authenticated_user(user)
        return ProjectListResponse(projects=[project_response(item) for item in self.store.list_projects(user.user_id)])

    def get_project(self, user: UserRecord | None, project_id: str) -> ProjectResponse:
        project = self._owned_project(user, project_id)
        return project_response(project)

    def create_project(self, user: UserRecord | None, payload: ProjectCreateRequest) -> ProjectResponse:
        user = require_authenticated_user(user)
        record = self.store.create_project(user=user, **payload.model_dump(mode="json"))
        return project_response(record)

    def update_project(self, user: UserRecord | None, project_id: str, payload: ProjectUpdateRequest) -> ProjectResponse:
        user = require_authenticated_user(user)
        updated = self.store.update_project(project_id, user_id=user.user_id, **payload.model_dump(mode="json"))
        if updated is None or updated.user_id != user.user_id or updated.archived_at is not None:
            raise self._not_found(project_id)
        return project_response(updated)

    def archive_project(self, user: UserRecord | None, project_id: str) -> ProjectResponse:
        user = require_authenticated_user(user)
        archived = self.store.archive_project(project_id, user.user_id)
        if archived is None or archived.user_id != user.user_id:
            raise self._not_found(project_id)
        return project_response(archived)

    def list_project_runs(self, user: UserRecord | None, project_id: str) -> ProjectRunListResponse:
        user = require_authenticated_user(user)
        self._owned_project(user, project_id)
        items = [
            ProjectRunItem(
                project_id=link.project_id,
                run_label=link.run_label,
                derived_from_run_id=link.derived_from_run_id,
                created_at=link.created_at,
                run=snapshot_from_run(run, self.store.has_result(run.run_id)),
            )
            for link, run in self.store.list_project_runs(project_id, user.user_id)
        ]
        return ProjectRunListResponse(project_id=project_id, runs=items)

    def create_project_run(
        self,
        user: UserRecord | None,
        project_id: str,
        payload: ProjectRunCreateRequest,
    ) -> ProjectRunCreateResponse:
        user = require_authenticated_user(user)
        self._owned_project(user, project_id)
        if self.enqueue_run is None:
            raise ServiceError(503, ErrorCode.QUEUE_UNAVAILABLE, "Worker queue is unavailable.")
        run_payload = payload.model_dump(mode="json", exclude={"run_label", "derived_from_run_id"}, exclude_none=True)
        run = create_run_for_user(
            store=self.store,
            enqueue_run=self.enqueue_run,
            payload=RunCreateRequest.model_validate(run_payload),
            user=user,
            page="/projects",
        )
        self.store.attach_project_run(
            project_id=project_id,
            run_id=run.run_id,
            user_id=user.user_id,
            derived_from_run_id=payload.derived_from_run_id,
            run_label=payload.run_label,
        )
        return ProjectRunCreateResponse(project_id=project_id, run=run)

    def _owned_project(self, user: UserRecord | None, project_id: str) -> ProjectRecord:
        user = require_authenticated_user(user)
        project = self.store.get_project(project_id)
        if project is None or project.user_id != user.user_id or project.archived_at is not None:
            raise self._not_found(project_id)
        return project

    @staticmethod
    def _not_found(project_id: str) -> ServiceError:
        return ServiceError(
            status_code=404,
            code=ErrorCode.RUN_NOT_FOUND,
            message="Project was not found.",
            details={"project_id": project_id},
        )
```

Keep the response shape exactly as the test expects.

- [ ] **Step 7: Add project API routes**

In `src/api/routes.py`, import the new schemas and `ProjectService`. Add a helper:

```python
def _project_service(request: Request) -> ProjectService:
    return ProjectService(_store(request), enqueue_run=_enqueue_run(request))
```

Add routes before `/api/runs` routes:

```python
@router.get("/api/projects")
async def list_projects(request: Request) -> ProjectListResponse:
    try:
        return _project_service(request).list_projects(_user_record_for_request(request))
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects")
async def create_project(request: Request, payload: ProjectCreateRequest) -> ProjectResponse:
    try:
        return _project_service(request).create_project(_user_record_for_request(request), payload)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}")
async def get_project(request: Request, project_id: str) -> ProjectResponse:
    try:
        return _project_service(request).get_project(_user_record_for_request(request), project_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.patch("/api/projects/{project_id}")
async def update_project(request: Request, project_id: str, payload: ProjectUpdateRequest) -> ProjectResponse:
    try:
        return _project_service(request).update_project(_user_record_for_request(request), project_id, payload)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/archive")
async def archive_project(request: Request, project_id: str) -> ProjectResponse:
    try:
        return _project_service(request).archive_project(_user_record_for_request(request), project_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}/runs")
async def list_project_runs(request: Request, project_id: str) -> ProjectRunListResponse:
    try:
        return _project_service(request).list_project_runs(_user_record_for_request(request), project_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs")
async def create_project_run(
    request: Request,
    project_id: str,
    payload: ProjectRunCreateRequest,
) -> ProjectRunCreateResponse:
    try:
        return _project_service(request).create_project_run(_user_record_for_request(request), project_id, payload)
    except ServiceError as exc:
        raise _service_error(exc) from exc
```

- [ ] **Step 8: Run API tests**

Run:

```bash
uv run pytest tests/test_project_api.py tests/test_api_app.py::test_api_presets_can_create_runs -q
```

Expected:

```text
passed
```

- [ ] **Step 9: Commit**

```bash
git add src/services src/api/schemas.py src/api/routes.py tests/test_project_api.py
git commit -m "feat: add project service api"
```

---

### Task 3: Project-Scoped Result, Export, Feedback, Follow-Up, and Interview

**Files:**
- Create: `src/services/followup_service.py`
- Create: `src/services/export_service.py`
- Modify: `src/services/project_service.py`
- Modify: `src/api/schemas.py`
- Modify: `src/api/routes.py`
- Create: `tests/test_followup_service.py`
- Modify: `tests/test_project_api.py`

**Interfaces:**
- Consumes:
  - Task 2 `ProjectService`
  - Existing `RunResultEnvelope`, `RunExportResponse`, `RunFeedbackRequest`, `RunFeedbackResponse`
  - Existing `PersonaSampler` and `BatchSimulator`

- Produces:
  - `ProjectRunFollowupRequest(question: str, cohort: str = "all", sample_size: int = 12)`
  - `ProjectRunFollowupResponse(question, cohort, panel_seed, answers, summary)`
  - `ProjectRunInterviewRequest(subject_uuid: str | None, question: str, sample_size: int = 1)`
  - `ProjectRunInterviewResponse(subject_uuid, question, answers, summary)`
  - `ProjectService.get_project_run_result(...)`
  - `ProjectService.export_project_run(...)`
  - `ProjectService.submit_project_run_feedback(...)`
  - `ProjectService.ask_followup(...)`
  - `ProjectService.ask_interview_question(...)`
  - Routes:
    - `GET /api/projects/{project_id}/runs/{run_id}/result`
    - `GET /api/projects/{project_id}/runs/{run_id}/export`
    - `POST /api/projects/{project_id}/runs/{run_id}/feedback`
    - `POST /api/projects/{project_id}/runs/{run_id}/followup`
    - `POST /api/projects/{project_id}/runs/{run_id}/interview`

- [ ] **Step 1: Write follow-up service tests**

Create `tests/test_followup_service.py`:

```python
from src.llm.base import LLMRequest, LLMResponse
from src.services.followup_service import run_followup, select_cohort_subset


class FakeFollowupLLM:
    async def generate(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            content="답변: 가격보다 가족에게 알림이 가는지가 더 중요합니다.",
            provider="fake",
            provider_model="fake-followup",
            trace_id="trace-followup",
            metadata={"task_type": request.task_type},
        )


def test_select_cohort_subset_uses_raw_results_only_for_selection() -> None:
    raw = [
        {"uuid": "p1", "parsed": {"score": 5}},
        {"uuid": "p2", "parsed": {"score": 1}},
        {"uuid": "p3", "parsed": {}},
    ]

    assert [item["uuid"] for item in select_cohort_subset(raw, "positive")] == ["p1"]
    assert [item["uuid"] for item in select_cohort_subset(raw, "negative")] == ["p2"]
    assert [item["uuid"] for item in select_cohort_subset(raw, "confused")] == ["p3"]
    assert [item["uuid"] for item in select_cohort_subset(raw, "all")] == ["p1", "p2", "p3"]


def test_run_followup_uses_original_seed_and_returns_answers() -> None:
    result = run_followup(
        original_run={
            "seed": 42,
            "sample_size": 4,
            "target_filter": {"province": ["Seoul"]},
        },
        question="왜 그렇게 느꼈나요?",
        cohort="all",
        raw_results=[],
        sample_size=2,
        llm_client=FakeFollowupLLM(),
    )

    assert result["question"] == "왜 그렇게 느꼈나요?"
    assert result["cohort"] == "all"
    assert result["panel_seed"] == 42
    assert len(result["answers"]) == 2
    assert result["answers"][0]["answer"] == "가격보다 가족에게 알림이 가는지가 더 중요합니다."
    assert "2명이 후속 질문에 응답" in result["summary"]
```

- [ ] **Step 2: Run the failing follow-up tests**

Run:

```bash
uv run pytest tests/test_followup_service.py -q
```

Expected:

```text
FAILED tests/test_followup_service.py::test_select_cohort_subset_uses_raw_results_only_for_selection - ModuleNotFoundError: No module named 'src.services.followup_service'
FAILED tests/test_followup_service.py::test_run_followup_uses_original_seed_and_returns_answers - ModuleNotFoundError: No module named 'src.services.followup_service'
```

- [ ] **Step 3: Add follow-up service**

Create `src/services/followup_service.py`. Port the working shape from `../misim/backend/followup.py`, replacing bridge imports with native koresim imports:

```python
from __future__ import annotations

import asyncio
import hashlib
from collections import Counter
from typing import Any

from src.agent.simulator import BatchSimulator
from src.data.sampler import PersonaSampler

_NAMES_F = ["강순녀", "나순희", "장화영", "유복연", "안혜영", "박미정", "조승희", "오은숙"]
_NAMES_M = ["이재호", "임병태", "손동하", "봉수훈", "오민영", "이성기", "권상운", "백용일"]


def select_cohort_subset(raw_results: list[dict[str, Any]], cohort: str) -> list[dict[str, Any]]:
    if cohort in {"positive", "high-intent"}:
        return [r for r in raw_results if _score(r) >= 4]
    if cohort == "negative":
        return [r for r in raw_results if _score(r) <= 2]
    if cohort == "confused":
        return [r for r in raw_results if not ((r.get("parsed") or {}).get("choice") or r.get("choice"))]
    return raw_results


def run_followup(
    *,
    original_run: dict[str, Any],
    question: str,
    cohort: str,
    raw_results: list[dict[str, Any]] | None = None,
    sample_size: int | None = None,
    llm_client: Any | None = None,
) -> dict[str, Any]:
    seed = int(original_run.get("seed") or 42)
    target_filter = original_run.get("target_filter") or {}
    panel = int(original_run.get("sample_size") or sample_size or 50)
    subset = select_cohort_subset(raw_results or [], cohort)
    subset_uuids = {r.get("uuid") for r in subset if r.get("uuid")}

    sampler = PersonaSampler()
    personas = sampler.sample(n=panel, filter_=target_filter or None, seed=seed)
    if subset_uuids:
        narrowed = [p for p in personas if p.get("uuid") in subset_uuids]
        if narrowed:
            personas = narrowed
    if sample_size is not None:
        personas = personas[: max(1, sample_size)]

    simulator = BatchSimulator(purpose="marketing", llm_client=llm_client)
    results = asyncio.run(simulator.run(personas, _followup_prompt(question)))

    answers: list[dict[str, Any]] = []
    for item in results:
        if item.error or not item.response:
            continue
        persona = item.persona or {}
        answers.append(
            {
                "uuid": item.uuid,
                "name": _display_name(persona, str(item.uuid or "")),
                "age": persona.get("age"),
                "sex": persona.get("sex", ""),
                "province": persona.get("province"),
                "answer": _parse_answer(item.response),
            }
        )
    return {
        "question": question,
        "cohort": cohort,
        "panel_seed": seed,
        "answers": answers,
        "summary": _summarize(answers, cohort),
    }


def _score(raw: dict[str, Any]) -> float:
    score = raw.get("score")
    if score is None:
        score = (raw.get("parsed") or {}).get("score")
    try:
        return float(score)
    except (TypeError, ValueError):
        return 0.0


def _display_name(persona: dict[str, Any], uuid: str) -> str:
    names = _NAMES_F if persona.get("sex") == "여자" else _NAMES_M
    if not uuid:
        return names[0]
    digest = int(hashlib.md5(uuid.encode("utf-8")).hexdigest(), 16)
    return names[digest % len(names)]


def _followup_prompt(question: str) -> str:
    return f"앞선 설문에 이어 추가 질문입니다.\n\n{question}\n\n답변 형식:\n답변: 한두 문장으로 솔직하게"


def _parse_answer(response: str) -> str:
    for line in response.splitlines():
        stripped = line.strip()
        if stripped.startswith("답변"):
            return stripped.split(":", 1)[-1].strip()[:240]
    return response.strip()[:240]


def _summarize(answers: list[dict[str, Any]], cohort: str) -> str:
    if not answers:
        return f"'{cohort}' 코호트에서 유효한 후속 응답이 없습니다."
    ages = [answer["age"] for answer in answers if isinstance(answer.get("age"), int)]
    age_note = ""
    if ages:
        age_note = f" (주 연령 {Counter(f'{age // 10 * 10}대' for age in ages).most_common(1)[0][0]})"
    return f"'{cohort}' 코호트 {len(answers)}명이 후속 질문에 응답했습니다{age_note}."
```

- [ ] **Step 4: Add schemas**

In `src/api/schemas.py`, after `RunFeedbackResponse`, add:

```python
class ProjectRunFollowupRequest(APIModel):
    question: str = Field(min_length=1, max_length=500)
    cohort: str = Field(default="all", max_length=80)
    sample_size: int = Field(default=12, ge=1, le=50)


class FollowupAnswer(APIModel):
    uuid: str
    name: str
    age: int | None = None
    sex: str = ""
    province: str | None = None
    answer: str


class ProjectRunFollowupResponse(APIModel):
    question: str
    cohort: str
    panel_seed: int
    answers: list[FollowupAnswer]
    summary: str


class ProjectRunInterviewRequest(APIModel):
    subject_uuid: str | None = Field(default=None, max_length=160)
    question: str = Field(min_length=1, max_length=500)
    sample_size: int = Field(default=1, ge=1, le=10)


class ProjectRunInterviewResponse(APIModel):
    subject_uuid: str | None = None
    question: str
    answers: list[FollowupAnswer]
    summary: str
```

- [ ] **Step 5: Move export response building into a service**

Create `src/services/export_service.py` by moving the current `_export_response` body out of `src/api/routes.py`:

```python
from __future__ import annotations

from src.api.schemas import RunExportResponse, RunResultEnvelope, RunStatus, SimulationType


def build_run_export_response(result: RunResultEnvelope) -> RunExportResponse:
    return RunExportResponse(
        run_id=result.run_id,
        simulation_type=SimulationType(result.simulation_type),
        status=RunStatus(result.status),
        seed=result.seed,
        sample_size=result.sample_size,
        total_responses=result.total_responses,
        parse_failed=result.parse_failed,
        target_filter=result.target_filter,
        sample_summary=result.sample_summary,
        quality=result.quality,
        warnings=result.warnings,
        metrics=result.metrics,
        segments=result.segments,
        insights=result.insights,
        model_alias=result.model_alias,
        provider=result.provider,
        provider_model=result.provider_model,
        llm_backend=result.llm_backend,
        trace_id=result.trace_id,
        human_review_required=True,
        raw_results_included=False,
        disclaimer=(
            "This export is a synthetic persona simulation report. It is not a real survey, "
            "and it must be reviewed by a human before external use."
        ),
    )
```

Then modify `src/api/routes.py` so `export_run_result()` calls `build_run_export_response(result)`, and remove the old local `_export_response` helper after confirming no other route uses it.

- [ ] **Step 6: Add project-scoped service methods**

In `src/services/project_service.py`, add imports for the new schemas, `RunFeedbackRequest`, `RunFeedbackResponse`, `RunResultEnvelope`, `RunExportResponse`, `run_followup`, and `build_run_export_response` from `src.services.export_service`.

Add methods:

```python
    def get_project_run_result(self, user: UserRecord | None, project_id: str, run_id: str) -> RunResultEnvelope:
        run = self._owned_project_run(user, project_id, run_id)
        result = self.store.get_result(run.run_id)
        if result is None:
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run_id, "status": run.status.value},
            )
        return RunResultEnvelope.model_validate(result.result)

    def export_project_run(self, user: UserRecord | None, project_id: str, run_id: str) -> RunExportResponse:
        return build_run_export_response(self.get_project_run_result(user, project_id, run_id))

    def submit_project_run_feedback(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: RunFeedbackRequest,
    ) -> RunFeedbackResponse:
        user = require_authenticated_user(user)
        run = self._owned_project_run(user, project_id, run_id)
        record = self.store.save_user_feedback(
            run_id=run_id,
            user=user,
            intake_session_id=payload.intake_session_id,
            usefulness_score=payload.usefulness_score,
            trust_score=payload.trust_score,
            actionability_score=payload.actionability_score,
            result_expectation=payload.result_expectation,
            free_text=payload.free_text,
            intended_action=payload.intended_action,
            decision_confidence_before=payload.decision_confidence_before,
            decision_confidence_after=payload.decision_confidence_after,
            shared_with_team=payload.shared_with_team,
            exported_report=payload.exported_report,
        )
        self.store.record_analytics_event(
            event_name="feedback_submitted",
            user=user,
            run_id=run_id,
            page="/projects/results",
            simulation_type=run.simulation_type,
            payload={"project_id": project_id},
        )
        return RunFeedbackResponse.model_validate(record)

    def ask_followup(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: ProjectRunFollowupRequest,
        llm_client: object | None = None,
    ) -> ProjectRunFollowupResponse:
        run = self._owned_project_run(user, project_id, run_id)
        result = self.store.get_result(run_id)
        if result is None:
            raise ServiceError(409, ErrorCode.RESULT_NOT_READY, "Run result is not ready yet.", {"run_id": run_id})
        body = run_followup(
            original_run={
                "seed": run.seed,
                "sample_size": run.sample_size,
                "target_filter": run.target_filter,
            },
            question=payload.question,
            cohort=payload.cohort,
            raw_results=result.result.get("raw_results") or [],
            sample_size=payload.sample_size,
            llm_client=llm_client,
        )
        return ProjectRunFollowupResponse.model_validate(body)

    def ask_interview_question(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: ProjectRunInterviewRequest,
        llm_client: object | None = None,
    ) -> ProjectRunInterviewResponse:
        cohort = payload.subject_uuid or "all"
        followup = self.ask_followup(
            user,
            project_id,
            run_id,
            ProjectRunFollowupRequest(question=payload.question, cohort=cohort, sample_size=payload.sample_size),
            llm_client=llm_client,
        )
        return ProjectRunInterviewResponse(
            subject_uuid=payload.subject_uuid,
            question=payload.question,
            answers=followup.answers,
            summary=followup.summary,
        )

    def _owned_project_run(self, user: UserRecord | None, project_id: str, run_id: str) -> RunRecord:
        user = require_authenticated_user(user)
        self._owned_project(user, project_id)
        link = self.store.get_project_run(project_id, run_id)
        run = self.store.get_run(run_id)
        if link is None or run is None or run.user_id != user.user_id:
            raise ServiceError(404, ErrorCode.RUN_NOT_FOUND, "Run was not found.", {"project_id": project_id, "run_id": run_id})
        return run
```

- [ ] **Step 7: Add project-scoped routes**

In `src/api/routes.py`, add:

```python
@router.get("/api/projects/{project_id}/runs/{run_id}/result")
async def get_project_run_result(request: Request, project_id: str, run_id: str) -> RunResultEnvelope:
    try:
        return _project_service(request).get_project_run_result(_user_record_for_request(request), project_id, run_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.get("/api/projects/{project_id}/runs/{run_id}/export")
async def export_project_run(request: Request, project_id: str, run_id: str) -> RunExportResponse:
    try:
        return _project_service(request).export_project_run(_user_record_for_request(request), project_id, run_id)
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/feedback")
async def submit_project_run_feedback(
    request: Request,
    project_id: str,
    run_id: str,
    payload: RunFeedbackRequest,
) -> RunFeedbackResponse:
    try:
        return _project_service(request).submit_project_run_feedback(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/followup")
async def ask_project_run_followup(
    request: Request,
    project_id: str,
    run_id: str,
    payload: ProjectRunFollowupRequest,
) -> ProjectRunFollowupResponse:
    try:
        return _project_service(request).ask_followup(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
            llm_client=request.app.state.llm_client,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc


@router.post("/api/projects/{project_id}/runs/{run_id}/interview")
async def ask_project_run_interview(
    request: Request,
    project_id: str,
    run_id: str,
    payload: ProjectRunInterviewRequest,
) -> ProjectRunInterviewResponse:
    try:
        return _project_service(request).ask_interview_question(
            _user_record_for_request(request),
            project_id,
            run_id,
            payload,
            llm_client=request.app.state.llm_client,
        )
    except ServiceError as exc:
        raise _service_error(exc) from exc
```

- [ ] **Step 8: Add project authorization tests**

Append to `tests/test_project_api.py` a test that creates a project/run as one user, saves a completed result with `store.save_result`, then verifies another user receives `404` for:

```python
for method, path, kwargs in [
    ("get", f"/api/projects/{project_id}/runs/{run_id}/result", {}),
    ("get", f"/api/projects/{project_id}/runs/{run_id}/export", {}),
    ("post", f"/api/projects/{project_id}/runs/{run_id}/feedback", {"json": {"usefulness_score": 4}}),
    ("post", f"/api/projects/{project_id}/runs/{run_id}/followup", {"json": {"question": "왜요?", "cohort": "all", "sample_size": 1}}),
    ("post", f"/api/projects/{project_id}/runs/{run_id}/interview", {"json": {"question": "더 설명해주세요.", "sample_size": 1}}),
]:
    response = getattr(other_client, method)(path, **kwargs)
    assert response.status_code == 404
```

Use the same auth helper already in `tests/test_project_api.py`.

- [ ] **Step 9: Run tests**

Run:

```bash
uv run pytest tests/test_followup_service.py tests/test_project_api.py -q
```

Expected:

```text
passed
```

- [ ] **Step 10: Commit**

```bash
git add src/services/followup_service.py src/services/project_service.py src/api/schemas.py src/api/routes.py tests/test_followup_service.py tests/test_project_api.py
git commit -m "feat: add project scoped result actions"
```

---

### Task 4: Frontend Types, API Client, and Route Shell

**Files:**
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/api/projects.ts`
- Modify: `frontend/src/Root.tsx`
- Create: `frontend/src/v2/types.ts`
- Create: `frontend/src/v2/navigation.ts`
- Create: `frontend/src/v2/V2AppShell.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Consumes:
  - Task 2 and Task 3 project API schemas.
  - Existing `App` and `ResultsPage` as classic pages.

- Produces:
  - `frontend/src/api/projects.ts` functions:
    - `listProjects()`
    - `createProject(payload)`
    - `getProject(projectId)`
    - `updateProject(projectId, payload)`
    - `archiveProject(projectId)`
    - `listProjectRuns(projectId)`
    - `createProjectRun(projectId, payload)`
    - `getProjectRunResult(projectId, runId)`
    - `getProjectRunExport(projectId, runId)`
    - `submitProjectRunFeedback(projectId, runId, payload)`
    - `askProjectRunFollowup(projectId, runId, payload)`
    - `askProjectRunInterview(projectId, runId, payload)`
  - Routes:
    - `/app` -> V2 app shell
    - `/projects` -> V2 projects page
    - `/projects/:projectId` -> V2 project detail
    - `/projects/:projectId/type` -> V2 simulation type page
    - `/projects/:projectId/intake` -> V2 intake
    - `/loading?project_id=...&run_id=...` -> V2 loading
    - `/results?run_id=...` -> V2 results
    - `/classic/app` -> classic `App`
    - `/classic/results?run_id=...` -> classic `ResultsPage`

- [ ] **Step 1: Add TypeScript API types**

In `frontend/src/types/api.ts`, mirror the backend models:

```ts
export interface ProjectCreateRequest {
  name: string
  description?: string
  product_context?: JsonObject
  features?: string[]
  prices?: string[]
  target_notes?: string
  alternatives?: string[]
}

export type ProjectUpdateRequest = ProjectCreateRequest

export interface ProjectResponse {
  project_id: string
  user_id: string
  name: string
  description: string
  product_context: JsonObject
  features: string[]
  prices: string[]
  target_notes: string
  alternatives: string[]
  created_at: string
  updated_at: string
  archived_at?: string | null
}

export interface ProjectListResponse {
  projects: ProjectResponse[]
}

export interface ProjectRunCreateRequest extends RunCreateRequest {
  run_label?: string | null
  derived_from_run_id?: string | null
}

export interface ProjectRunItem {
  project_id: string
  run_label?: string | null
  derived_from_run_id?: string | null
  created_at: string
  run: RunSnapshot
}

export interface ProjectRunListResponse {
  project_id: string
  runs: ProjectRunItem[]
}

export interface ProjectRunCreateResponse {
  project_id: string
  run: RunCreateResponse
}

export interface ProjectRunFollowupRequest {
  question: string
  cohort?: string
  sample_size?: number
}

export interface FollowupAnswer {
  uuid: string
  name: string
  age?: number | null
  sex: string
  province?: string | null
  answer: string
}

export interface ProjectRunFollowupResponse {
  question: string
  cohort: string
  panel_seed: number
  answers: FollowupAnswer[]
  summary: string
}

export interface ProjectRunInterviewRequest {
  subject_uuid?: string | null
  question: string
  sample_size?: number
}

export interface ProjectRunInterviewResponse {
  subject_uuid?: string | null
  question: string
  answers: FollowupAnswer[]
  summary: string
}
```

- [ ] **Step 2: Add typed project API client**

Create `frontend/src/api/projects.ts`:

```ts
import { requestJson } from './client'
import type {
  ProjectCreateRequest,
  ProjectListResponse,
  ProjectResponse,
  ProjectRunCreateRequest,
  ProjectRunCreateResponse,
  ProjectRunFollowupRequest,
  ProjectRunFollowupResponse,
  ProjectRunInterviewRequest,
  ProjectRunInterviewResponse,
  ProjectRunListResponse,
  ProjectUpdateRequest,
  RunExportResponse,
  RunFeedbackRequest,
  RunFeedbackResponse,
  RunResultEnvelope,
} from '../types/api'

const enc = encodeURIComponent

export function listProjects(): Promise<ProjectListResponse> {
  return requestJson<ProjectListResponse>('/api/projects')
}

export function createProject(payload: ProjectCreateRequest): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>('/api/projects', { method: 'POST', body: JSON.stringify(payload) })
}

export function getProject(projectId: string): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`/api/projects/${enc(projectId)}`)
}

export function updateProject(projectId: string, payload: ProjectUpdateRequest): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`/api/projects/${enc(projectId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function archiveProject(projectId: string): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`/api/projects/${enc(projectId)}/archive`, { method: 'POST' })
}

export function listProjectRuns(projectId: string): Promise<ProjectRunListResponse> {
  return requestJson<ProjectRunListResponse>(`/api/projects/${enc(projectId)}/runs`)
}

export function createProjectRun(projectId: string, payload: ProjectRunCreateRequest): Promise<ProjectRunCreateResponse> {
  return requestJson<ProjectRunCreateResponse>(`/api/projects/${enc(projectId)}/runs`, { method: 'POST', body: JSON.stringify(payload) })
}

export function getProjectRunResult(projectId: string, runId: string): Promise<RunResultEnvelope> {
  return requestJson<RunResultEnvelope>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/result`)
}

export function getProjectRunExport(projectId: string, runId: string): Promise<RunExportResponse> {
  return requestJson<RunExportResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/export`)
}

export function submitProjectRunFeedback(projectId: string, runId: string, payload: RunFeedbackRequest): Promise<RunFeedbackResponse> {
  return requestJson<RunFeedbackResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/feedback`, { method: 'POST', body: JSON.stringify(payload) })
}

export function askProjectRunFollowup(projectId: string, runId: string, payload: ProjectRunFollowupRequest): Promise<ProjectRunFollowupResponse> {
  return requestJson<ProjectRunFollowupResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/followup`, { method: 'POST', body: JSON.stringify(payload) })
}

export function askProjectRunInterview(projectId: string, runId: string, payload: ProjectRunInterviewRequest): Promise<ProjectRunInterviewResponse> {
  return requestJson<ProjectRunInterviewResponse>(`/api/projects/${enc(projectId)}/runs/${enc(runId)}/interview`, { method: 'POST', body: JSON.stringify(payload) })
}
```

- [ ] **Step 3: Add route helpers and V2 shell skeleton**

Create `frontend/src/v2/navigation.ts`:

```ts
export type V2Route =
  | { page: 'landing' }
  | { page: 'projects' }
  | { page: 'project'; projectId: string }
  | { page: 'type'; projectId: string }
  | { page: 'intake'; projectId: string; simulationType?: string | null }
  | { page: 'loading'; projectId: string | null; runId: string | null }
  | { page: 'results'; runId: string | null; projectId: string | null }
  | { page: 'classic-app' }
  | { page: 'classic-results' }
  | { page: 'admin' }
  | { page: 'validation' }
  | { page: 'results-story'; storyId: string }

export function parseV2Route(pathname = window.location.pathname, search = window.location.search, hash = window.location.hash): V2Route {
  if (hash === '#app') {
    window.history.replaceState(null, '', '/app')
    return { page: 'projects' }
  }
  if (hash === '#results') {
    window.history.replaceState(null, '', '/results')
    return { page: 'results', runId: new URLSearchParams(search).get('run_id'), projectId: new URLSearchParams(search).get('project_id') }
  }
  const path = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  if (path === '/app' || path === '/projects') return { page: 'projects' }
  if (path === '/admin') return { page: 'admin' }
  if (path === '/validation') return { page: 'validation' }
  if (path === '/classic/app') return { page: 'classic-app' }
  if (path === '/classic/results') return { page: 'classic-results' }
  if (path === '/loading') return { page: 'loading', projectId: params.get('project_id'), runId: params.get('run_id') }
  if (path === '/results') return { page: 'results', runId: params.get('run_id'), projectId: params.get('project_id') }
  if (path.startsWith('/results/story/')) return { page: 'results-story', storyId: decodeURIComponent(path.slice('/results/story/'.length)) }
  const projectType = path.match(/^\/projects\/([^/]+)\/type$/)
  if (projectType) return { page: 'type', projectId: decodeURIComponent(projectType[1]) }
  const projectIntake = path.match(/^\/projects\/([^/]+)\/intake$/)
  if (projectIntake) return { page: 'intake', projectId: decodeURIComponent(projectIntake[1]), simulationType: params.get('type') }
  const project = path.match(/^\/projects\/([^/]+)$/)
  if (project) return { page: 'project', projectId: decodeURIComponent(project[1]) }
  return { page: 'landing' }
}

export function navigateTo(path: string): void {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
```

Create `frontend/src/v2/V2AppShell.tsx`:

```tsx
import { AuthStatus } from '../components/AuthStatus'
import type { V2Route } from './navigation'
import { navigateTo } from './navigation'

type Props = {
  route: V2Route
  children: React.ReactNode
}

const stages = [
  { id: 'projects', label: '프로젝트' },
  { id: 'type', label: '유형' },
  { id: 'intake', label: '입력' },
  { id: 'results', label: '결과' },
]

function activeStage(route: V2Route): string {
  if (route.page === 'project') return 'projects'
  if (route.page === 'loading') return 'results'
  return stages.some((stage) => stage.id === route.page) ? route.page : 'projects'
}

export function V2AppShell({ route, children }: Props) {
  const active = activeStage(route)
  return (
    <div className="v2-shell">
      <header className="v2-topbar">
        <button className="v2-brand" type="button" onClick={() => navigateTo('/projects')}>KoreaSim V2</button>
        <nav className="v2-nav" aria-label="Primary">
          <button type="button" onClick={() => navigateTo('/projects')}>프로젝트</button>
          <button type="button" onClick={() => navigateTo('/classic/app')}>Classic</button>
        </nav>
        <AuthStatus compact />
      </header>
      <div className="v2-flow-rail">
        {stages.map((stage) => (
          <span className={stage.id === active ? 'active' : ''} key={stage.id}>{stage.label}</span>
        ))}
      </div>
      <main className="v2-main">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Wire `Root.tsx` routes**

Modify `frontend/src/Root.tsx` so classic imports are aliased:

```tsx
import ClassicApp from "./App";
import { ResultsPage as ClassicResultsPage, ResultsStoryPage } from "./ResultsPage";
import { V2AppShell } from "./v2/V2AppShell";
import { parseV2Route, type V2Route } from "./v2/navigation";
```

Use `V2Route` for state:

```tsx
function getRouteState(): V2Route {
  return parseV2Route();
}
```

For the first routing commit, render an interim skeleton until Tasks 5 and 6 replace it:

```tsx
  if (route.page === "classic-app") return <ClassicApp />;
  if (route.page === "classic-results") return <ClassicResultsPage />;
  if (route.page === "admin") return <AdminPage />;
  if (route.page === "validation") return <ValidationPage />;
  if (route.page === "results-story") return <ResultsStoryPage storyId={route.storyId} />;
  if (route.page === "landing") return <LandingPage />;

  return (
    <V2AppShell route={route}>
      <section className="v2-empty-state">
        <h1>프로젝트</h1>
        <p>V2 화면을 불러오는 중입니다.</p>
      </section>
    </V2AppShell>
  );
```

- [ ] **Step 5: Add base V2 CSS and MCP proxy**

Append to `frontend/src/styles.css`:

```css
.v2-shell {
  min-height: 100vh;
  background: #0d1110;
  color: #f5f7f2;
}

.v2-topbar {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(245, 247, 242, 0.12);
}

.v2-brand,
.v2-nav button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.v2-brand {
  font-weight: 800;
}

.v2-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.v2-nav button {
  padding: 8px 10px;
  border-radius: 8px;
}

.v2-nav button:hover {
  background: rgba(217, 255, 90, 0.12);
}

.v2-flow-rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(245, 247, 242, 0.08);
}

.v2-flow-rail span {
  min-height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(245, 247, 242, 0.72);
}

.v2-flow-rail span.active {
  background: #d9ff5a;
  color: #11150f;
  font-weight: 800;
}

.v2-main {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.v2-empty-state {
  display: grid;
  gap: 8px;
  padding: 48px 0;
}
```

In `frontend/vite.config.ts`, add `/mcp` to `server.proxy`:

```ts
      "/mcp": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
cd frontend
npm run typecheck
npm run build
```

Expected:

```text
> frontend@0.0.0 typecheck
> tsc --noEmit

> frontend@0.0.0 build
> node scripts/generate-seo-pages.mjs && tsc && vite build
```

The commands exit with status `0`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/api/projects.ts frontend/src/Root.tsx frontend/src/v2 frontend/src/styles.css frontend/vite.config.ts
git commit -m "feat: add v2 frontend route shell"
```

---

### Task 5: Project, Simulation Type, and Intake UX

**Files:**
- Create: `frontend/src/v2/ProjectsPage.tsx`
- Create: `frontend/src/v2/ProjectDetailPage.tsx`
- Create: `frontend/src/v2/SimulationTypePage.tsx`
- Create: `frontend/src/v2/MinsimIntakeFlow.tsx`
- Modify: `frontend/src/Root.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes:
  - `frontend/src/api/projects.ts`
  - `frontend/src/intake/planner.ts`
  - `frontend/src/intake/payloadBuilder.ts`
  - `frontend/src/intake/packRegistry.ts`
  - `frontend/src/simulations/registry.ts`
  - `navigateTo(path)`

- Produces:
  - Full V2 project list, project detail, simulation selection, and intake-to-run flow.
  - `POST /api/projects/{project_id}/runs` is used for actual run creation.

- [ ] **Step 1: Create ProjectsPage**

Create `frontend/src/v2/ProjectsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { createProject, listProjects } from '../api/projects'
import type { ProjectResponse } from '../types/api'
import { navigateTo } from './navigation'

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProjects()
      .then((response) => setProjects(response.projects))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const project = await createProject({ name, description, product_context: {}, features: [], prices: [], alternatives: [] })
    navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)
  }

  return (
    <section className="v2-projects">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Projects</p>
          <h1>제품 단위로 시뮬레이션을 이어갑니다</h1>
        </div>
      </div>
      <form className="v2-create-project" onSubmit={submit}>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="프로젝트 이름" required />
        <input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="짧은 설명" />
        <button type="submit">새 프로젝트</button>
      </form>
      {loading && <p className="v2-muted">불러오는 중</p>}
      {error && <p className="v2-error">{error}</p>}
      <div className="v2-project-grid">
        {projects.map((project) => (
          <button className="v2-project-card" key={project.project_id} type="button" onClick={() => navigateTo(`/projects/${encodeURIComponent(project.project_id)}`)}>
            <span>{project.name}</span>
            <small>{project.description || '등록 정보 없음'}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create ProjectDetailPage**

Create `frontend/src/v2/ProjectDetailPage.tsx` with editable product context and run list. Use these actions:

```tsx
const save = async () => {
  const updated = await updateProject(projectId, {
    name,
    description,
    product_context: { product_description: productContext },
    features: splitLines(features),
    prices: splitLines(prices),
    target_notes: targetNotes,
    alternatives: splitLines(alternatives),
  })
  setProject(updated)
}

const start = () => navigateTo(`/projects/${encodeURIComponent(projectId)}/type`)
```

The render must include:

```tsx
<button type="button" onClick={start}>새 시뮬레이션</button>
<button type="button" onClick={save}>저장</button>
```

Run cards navigate to:

```ts
navigateTo(`/results?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(item.run.run_id)}`)
```

- [ ] **Step 3: Create SimulationTypePage**

Create `frontend/src/v2/SimulationTypePage.tsx`. Use `simulationLabels` and all values of `SimulationType`:

```tsx
import type { SimulationType } from '../types/api'
import { simulationLabels } from '../simulations/registry'
import { navigateTo } from './navigation'

const types: SimulationType[] = [
  'creative_testing',
  'price_optimization',
  'product_launch',
  'value_proposition',
  'market_segmentation',
  'competitive_positioning',
  'brand_perception',
  'churn_prediction',
  'campaign_strategy',
]

export function SimulationTypePage({ projectId }: { projectId: string }) {
  return (
    <section className="v2-type-page">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">Simulation</p>
          <h1>무엇을 검증할까요?</h1>
        </div>
      </div>
      <div className="v2-type-grid">
        {types.map((type) => (
          <button key={type} type="button" onClick={() => navigateTo(`/projects/${encodeURIComponent(projectId)}/intake?type=${encodeURIComponent(type)}`)}>
            <span>{simulationLabels[type]}</span>
            <small>{type}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create MinsimIntakeFlow**

Create `frontend/src/v2/MinsimIntakeFlow.tsx`. Reuse the existing local intake planner for state and call the project run API at submit:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { createProjectRun, getProject } from '../api/projects'
import { advanceIntakeSession, createInitialIntakeSession } from '../intake/planner'
import { buildGenericSimulationPayload, validateCreativeTestingPayload } from '../intake/payloadBuilder'
import type { IntakeSession } from '../intake/types'
import type { ProjectResponse, SimulationType } from '../types/api'
import { navigateTo } from './navigation'

export function MinsimIntakeFlow({ projectId, simulationType }: { projectId: string; simulationType: SimulationType | null }) {
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [session, setSession] = useState<IntakeSession>(() => createInitialIntakeSession())
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const type = simulationType ?? 'creative_testing'

  useEffect(() => {
    getProject(projectId).then(setProject).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectId])

  useEffect(() => {
    setSession((current) => ({
      ...current,
      taskFrame: {
        taskId: current.taskFrame?.taskId ?? `v2-${type}`,
        userGoal: current.taskFrame?.userGoal ?? project?.description ?? '',
        decisionQuestion: current.taskFrame?.decisionQuestion ?? '어떤 선택지가 더 설득력 있는가?',
        likelySimulationTypes: current.taskFrame?.likelySimulationTypes ?? [type],
        primarySimulationType: type,
        preSimulationActions: type === 'creative_testing' ? ['generate_creative_candidates'] : [],
        confidence: 0.8,
        evidence: current.taskFrame?.evidence ?? ['project context'],
      },
    }))
  }, [project?.description, type])

  const payload = useMemo(() => buildGenericSimulationPayload(session), [session])
  const creativeErrors = payload.simulation_type === 'creative_testing' ? validateCreativeTestingPayload(payload) : []

  const send = () => {
    const next = advanceIntakeSession(session, { type: 'user_message', content: message, selectedSimulationType: type })
    setSession(next)
    setMessage('')
  }

  const run = async () => {
    if (creativeErrors.length > 0) {
      setError(creativeErrors[0].message)
      return
    }
    const response = await createProjectRun(projectId, {
      ...payload,
      simulation_type: type,
      run_label: `${project?.name ?? 'Project'} ${new Date().toLocaleDateString('ko-KR')}`,
    })
    navigateTo(`/loading?project_id=${encodeURIComponent(projectId)}&run_id=${encodeURIComponent(response.run.run_id)}`)
  }

  return (
    <section className="v2-intake">
      <div className="v2-page-head">
        <div>
          <p className="v2-kicker">{project?.name ?? 'Project'}</p>
          <h1>입력값을 정리합니다</h1>
        </div>
        <button type="button" onClick={run}>실행</button>
      </div>
      <div className="v2-chat-panel">
        {session.messages.map((item) => (
          <p className={`v2-chat-line ${item.role}`} key={`${item.role}-${item.content}`}>{item.content}</p>
        ))}
        <div className="v2-chat-input">
          <input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send() }} />
          <button type="button" onClick={send}>보내기</button>
        </div>
      </div>
      {error && <p className="v2-error">{error}</p>}
    </section>
  )
}
```

The intake event object above matches the exported `IntakeEvent` union in `frontend/src/intake/types.ts`.

- [ ] **Step 5: Wire pages in Root**

Modify `frontend/src/Root.tsx`:

```tsx
import { ProjectsPage } from "./v2/ProjectsPage";
import { ProjectDetailPage } from "./v2/ProjectDetailPage";
import { SimulationTypePage } from "./v2/SimulationTypePage";
import { MinsimIntakeFlow } from "./v2/MinsimIntakeFlow";
import type { SimulationType } from "./types/api";
```

Add render cases inside `<V2AppShell>`:

```tsx
  let content: React.ReactNode = <ProjectsPage />;
  if (route.page === "project") content = <ProjectDetailPage projectId={route.projectId} />;
  if (route.page === "type") content = <SimulationTypePage projectId={route.projectId} />;
  if (route.page === "intake") content = <MinsimIntakeFlow projectId={route.projectId} simulationType={(route.simulationType as SimulationType | null) ?? null} />;

  return <V2AppShell route={route}>{content}</V2AppShell>;
```

- [ ] **Step 6: Add page CSS**

Append CSS for `.v2-page-head`, `.v2-project-grid`, `.v2-project-card`, `.v2-type-grid`, `.v2-chat-panel`, `.v2-chat-line`, `.v2-chat-input`, `.v2-error`, and `.v2-muted`. Keep cards at `border-radius: 8px` and ensure mobile wraps with:

```css
@media (max-width: 720px) {
  .v2-page-head,
  .v2-create-project,
  .v2-chat-input {
    grid-template-columns: 1fr;
  }

  .v2-project-grid,
  .v2-type-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run frontend verification**

Run:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Expected:

```text
passed
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/v2 frontend/src/Root.tsx frontend/src/styles.css
git commit -m "feat: add minsim project intake ux"
```

---

### Task 6: Result Adapter, Loading, and Minsim Results UX

**Files:**
- Create: `frontend/src/v2/resultAdapter.ts`
- Create: `frontend/src/v2/resultAdapterFixtures.ts`
- Create: `frontend/src/v2/resultAdapterFixtureCheck.ts`
- Create: `frontend/scripts/check-minsim-result-fixtures.mjs`
- Modify: `frontend/package.json`
- Create: `frontend/src/v2/MinsimLoadingPage.tsx`
- Create: `frontend/src/v2/MinsimResultsPage.tsx`
- Modify: `frontend/src/v2/types.ts`
- Modify: `frontend/src/Root.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes:
  - Existing `RunResultEnvelope`, `RunSnapshot`, `RawPersonaResult`, `RunExportResponse`
  - Existing `useRunEvents(runId, enabled)`
  - Project result APIs from `frontend/src/api/projects.ts`
  - Direct run APIs from `frontend/src/api/runs.ts` for non-project result links.

- Produces:
  - `resultToMinsimView(result: RunResultEnvelope, snapshot?: RunSnapshot | null) -> MinsimReportView`
  - Live loading page using SSE snapshot.
  - Live result report with metrics, segments, personas, evidence, trust, export, feedback, follow-up, and interview.

- [ ] **Step 1: Define V2 report types**

Create or update `frontend/src/v2/types.ts`:

```ts
import type { JsonObject, RunResultEnvelope, RunSnapshot, SimulationType } from '../types/api'

export type MinsimOptionCard = {
  id: string
  label: string
  detail: string | null
  count: number
  pct: number | null
  rank: number
}

export type MinsimSegmentCell = {
  segment: string
  option: string
  count: number
  pct: number | null
}

export type MinsimPersonaCard = {
  uuid: string
  label: string
  age: number | null
  sex: string | null
  province: string | null
  primary: string
  quote: string
}

export type MinsimTrustLayer = {
  sampleSize: number
  totalResponses: number
  parseFailed: number
  warnings: string[]
  quality: JsonObject
  seed: number
  modelAlias: string | null
  provider: string | null
  providerModel: string | null
  timestamp: string | null
  disclaimer: string
}

export type MinsimReportView = {
  runId: string
  simulationType: SimulationType
  title: string
  verdict: string
  summary: string
  optionCards: MinsimOptionCard[]
  segmentMatrix: MinsimSegmentCell[]
  personas: MinsimPersonaCard[]
  evidenceQuotes: string[]
  findings: string[]
  actions: string[]
  risks: string[]
  trust: MinsimTrustLayer
  raw: RunResultEnvelope
  snapshot: RunSnapshot | null
}
```

- [ ] **Step 2: Implement result adapter**

Create `frontend/src/v2/resultAdapter.ts`:

```ts
import { getMetricSections, getResultSummary, getSimulationLabel } from '../simulations/registry'
import type { JsonObject, RawPersonaResult, RunResultEnvelope, RunSnapshot } from '../types/api'
import type { MinsimOptionCard, MinsimPersonaCard, MinsimReportView, MinsimSegmentCell } from './types'

export function resultToMinsimView(result: RunResultEnvelope, snapshot: RunSnapshot | null = null): MinsimReportView {
  const optionCards = buildOptionCards(result)
  const personas = result.raw_results.slice(0, 18).map(personaCard)
  const findings = listStrings(result.insights, ['title', 'summary', 'insight']).slice(0, 8)
  const orchestration = isRecord(result.orchestration) ? result.orchestration : {}
  const actions = listStrings(orchestration.actions, ['title', 'action', 'summary']).slice(0, 8)
  const risks = listStrings(orchestration.risks, ['title', 'risk', 'summary']).slice(0, 8)
  const summary = getResultSummary(result)
  return {
    runId: result.run_id,
    simulationType: result.simulation_type,
    title: getSimulationLabel(result.simulation_type),
    verdict: optionCards[0] ? `${optionCards[0].label} 우세` : summary,
    summary,
    optionCards,
    segmentMatrix: buildSegmentMatrix(result),
    personas,
    evidenceQuotes: personas.map((item) => item.quote).filter(Boolean).slice(0, 12),
    findings,
    actions,
    risks,
    trust: {
      sampleSize: result.sample_size,
      totalResponses: result.total_responses,
      parseFailed: result.parse_failed,
      warnings: result.warnings,
      quality: result.quality,
      seed: result.seed,
      modelAlias: result.model_alias ?? null,
      provider: result.provider ?? null,
      providerModel: result.provider_model ?? null,
      timestamp: snapshot?.completed_at ?? snapshot?.updated_at ?? null,
      disclaimer: 'Synthetic persona simulation. Use as directional decision support with human review.',
    },
    raw: result,
    snapshot,
  }
}

function buildOptionCards(result: RunResultEnvelope): MinsimOptionCard[] {
  return getMetricSections(result)
    .flatMap((section) => section.rows.map((row) => ({ row, section })))
    .map(({ row }, index) => ({
      id: `${row.label}-${index}`,
      label: row.label,
      detail: row.detail ?? null,
      count: row.count ?? Number(row.value ?? 0) || 0,
      pct: row.pct ?? null,
      rank: index + 1,
    }))
    .sort((a, b) => (b.pct ?? b.count) - (a.pct ?? a.count))
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

function buildSegmentMatrix(result: RunResultEnvelope): MinsimSegmentCell[] {
  const cells: MinsimSegmentCell[] = []
  Object.entries(result.segments).forEach(([segmentName, value]) => {
    if (!isRecord(value)) return
    Object.entries(value).forEach(([option, raw]) => {
      if (isRecord(raw)) {
        cells.push({
          segment: segmentName,
          option,
          count: asNumber(raw.count) ?? 0,
          pct: asNumber(raw.pct),
        })
      } else {
        cells.push({ segment: segmentName, option, count: asNumber(raw) ?? 0, pct: null })
      }
    })
  })
  return cells
}

function personaCard(raw: RawPersonaResult): MinsimPersonaCard {
  const persona = raw.persona ?? {}
  const parsed = raw.parsed ?? {}
  const primary = firstString([parsed.choice, parsed.intent, parsed.segment, parsed.primary, parsed.reaction, parsed.score]) ?? '응답'
  return {
    uuid: raw.uuid,
    label: [persona.age, persona.sex, persona.province].filter(Boolean).join(' · ') || raw.uuid,
    age: asNumber(persona.age),
    sex: firstString([persona.sex]),
    province: firstString([persona.province]),
    primary,
    quote: raw.response || raw.error || '',
  }
}

function listStrings(value: unknown, keys: string[]): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (!isRecord(item)) return null
      for (const key of keys) {
        const found = item[key]
        if (typeof found === 'string' && found.trim()) return found
      }
      return null
    })
    .filter((item): item is string => Boolean(item))
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
```

- [ ] **Step 3: Add fixture checks**

Create `frontend/src/v2/resultAdapterFixtures.ts` with two fixtures:

```ts
import { creativeTestingSuccess10Envelope } from '../data/apiFixtures'
import type { RunResultEnvelope } from '../types/api'

export const genericMarketSegmentationEnvelope: RunResultEnvelope = {
  schema_version: 'result-envelope/v1',
  run_id: 'fixture-market',
  simulation_type: 'market_segmentation',
  status: 'completed',
  seed: 42,
  sample_size: 3,
  total_responses: 3,
  parse_failed: 0,
  target_filter: {},
  sample_summary: {},
  quality: { parse_rate: 1 },
  warnings: [],
  metrics: {
    segment_counts: { pragmatic: 2, premium: 1 },
    segment_pct: { pragmatic: 66.7, premium: 33.3 },
  },
  segments: {
    age: { pragmatic: { count: 2, pct: 66.7 }, premium: { count: 1, pct: 33.3 } },
  },
  insights: [{ title: '실용 세그먼트가 가장 큽니다.' }],
  raw_results: [
    { uuid: 'p1', persona: { age: 34, sex: '여자', province: 'Seoul' }, response: '가격 대비 효율이 중요합니다.', parsed: { segment: 'pragmatic', score: 4 } },
    { uuid: 'p2', persona: { age: 44, sex: '남자', province: 'Busan' }, response: '프리미엄 기능이면 지불합니다.', parsed: { segment: 'premium', score: 5 } },
  ],
  orchestration: { actions: [{ action: '실용 세그먼트용 메시지를 분리합니다.' }], risks: [{ risk: '프리미엄 해석 표본이 작습니다.' }] },
}

export const resultAdapterFixtures = [
  creativeTestingSuccess10Envelope as RunResultEnvelope,
  genericMarketSegmentationEnvelope,
]
```

Create `frontend/src/v2/resultAdapterFixtureCheck.ts`:

```ts
import { resultAdapterFixtures } from './resultAdapterFixtures'
import { resultToMinsimView } from './resultAdapter'

export function runMinsimResultFixtureCheck() {
  const failures: string[] = []
  for (const fixture of resultAdapterFixtures) {
    const view = resultToMinsimView(fixture)
    if (view.runId !== fixture.run_id) failures.push(`${fixture.run_id}: runId mismatch`)
    if (view.optionCards.length === 0) failures.push(`${fixture.run_id}: option cards missing`)
    if (view.trust.sampleSize !== fixture.sample_size) failures.push(`${fixture.run_id}: sample size not preserved`)
    if (view.personas.length === 0) failures.push(`${fixture.run_id}: persona cards missing`)
  }
  return { ok: failures.length === 0, checked: resultAdapterFixtures.length, failures }
}
```

Create `frontend/scripts/check-minsim-result-fixtures.mjs`:

```js
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/src/v2/resultAdapterFixtureCheck.ts");
  const result = module.runMinsimResultFixtureCheck();
  if (!result.ok) {
    console.error(result.failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Minsim result fixture check passed (${result.checked} fixtures).`);
  }
} finally {
  await server.close();
}
```

Modify `frontend/package.json`:

```json
"check:minsim": "node scripts/check-minsim-result-fixtures.mjs",
"verify": "npm run lint && npm run typecheck && npm run check:intake && npm run check:minsim && npm run check:landing && npm run build"
```

- [ ] **Step 4: Add loading page**

Create `frontend/src/v2/MinsimLoadingPage.tsx`:

```tsx
import { useEffect } from 'react'
import { useRunEvents } from '../hooks/useRunEvents'
import { navigateTo } from './navigation'

export function MinsimLoadingPage({ projectId, runId }: { projectId: string | null; runId: string | null }) {
  const { snapshot, error } = useRunEvents(runId, Boolean(runId))
  useEffect(() => {
    if (snapshot?.status === 'completed') {
      const params = new URLSearchParams()
      if (projectId) params.set('project_id', projectId)
      if (runId) params.set('run_id', runId)
      navigateTo(`/results?${params.toString()}`)
    }
  }, [projectId, runId, snapshot?.status])

  return (
    <section className="v2-loading">
      <p className="v2-kicker">Running</p>
      <h1>{snapshot?.progress_pct ?? 0}%</h1>
      <div className="v2-progress"><span style={{ width: `${snapshot?.progress_pct ?? 0}%` }} /></div>
      <p>{snapshot?.done_count ?? 0} / {snapshot?.total_count ?? 0}</p>
      {error && <p className="v2-error">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 5: Add results page**

Create `frontend/src/v2/MinsimResultsPage.tsx`. It must:

- Read `runId` and optional `projectId` props from route.
- Fetch `getProjectRunResult(projectId, runId)` when `projectId` exists.
- Fetch `getRunResult(runId)` when no `projectId` exists.
- Convert with `resultToMinsimView`.
- Render option cards, segment matrix, personas, evidence, trust layer.
- Use project-scoped `getProjectRunExport`, `submitProjectRunFeedback`, `askProjectRunFollowup`, and `askProjectRunInterview` when `projectId` exists.
- Keep classic export JSON redaction semantics by calling backend export endpoint, not serializing raw results in the browser.

Use this component skeleton:

```tsx
export function MinsimResultsPage({ projectId, runId }: { projectId: string | null; runId: string | null }) {
  const [view, setView] = useState<MinsimReportView | null>(null)
  const [question, setQuestion] = useState('')
  const [followup, setFollowup] = useState<ProjectRunFollowupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) return
    const load = projectId ? getProjectRunResult(projectId, runId) : getRunResult(runId)
    load.then((result) => setView(resultToMinsimView(result))).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectId, runId])

  const exportJson = async () => {
    if (!runId) return
    const data = projectId ? await getProjectRunExport(projectId, runId) : await getRunExport(runId)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `koresim-${runId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const sendFollowup = async () => {
    if (!projectId || !runId || !question.trim()) return
    const response = await askProjectRunFollowup(projectId, runId, { question, cohort: 'all', sample_size: 8 })
    setFollowup(response)
    setQuestion('')
  }

  if (error) return <p className="v2-error">{error}</p>
  if (!view) return <p className="v2-muted">결과를 불러오는 중</p>

  return (
    <section className="v2-results">
      <div className="v2-result-hero">
        <p className="v2-kicker">{view.title}</p>
        <h1>{view.verdict}</h1>
        <p>{view.summary}</p>
        <button type="button" onClick={exportJson}>Export</button>
      </div>
      <div className="v2-option-grid">
        {view.optionCards.map((card) => (
          <article className="v2-option-card" key={card.id}>
            <b>#{card.rank} {card.label}</b>
            <span>{card.pct ?? card.count}{card.pct !== null ? '%' : '명'}</span>
            {card.detail && <small>{card.detail}</small>}
          </article>
        ))}
      </div>
      <section className="v2-report-section">
        <h2>Persona evidence</h2>
        <div className="v2-persona-grid">
          {view.personas.map((persona) => (
            <article className="v2-persona-card" key={persona.uuid}>
              <b>{persona.label}</b>
              <span>{persona.primary}</span>
              <p>{persona.quote}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="v2-report-section">
        <h2>Follow-up</h2>
        <div className="v2-chat-input">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="후속 질문" />
          <button type="button" onClick={sendFollowup} disabled={!projectId}>질문</button>
        </div>
        {followup && <p>{followup.summary}</p>}
      </section>
      <section className="v2-trust">
        <span>n={view.trust.sampleSize}</span>
        <span>responses={view.trust.totalResponses}</span>
        <span>parse failed={view.trust.parseFailed}</span>
        <span>seed={view.trust.seed}</span>
      </section>
    </section>
  )
}
```

- [ ] **Step 6: Wire loading and results routes**

Modify `frontend/src/Root.tsx`:

```tsx
import { MinsimLoadingPage } from "./v2/MinsimLoadingPage";
import { MinsimResultsPage } from "./v2/MinsimResultsPage";
```

Add render cases:

```tsx
  if (route.page === "loading") content = <MinsimLoadingPage projectId={route.projectId} runId={route.runId} />;
  if (route.page === "results") content = <MinsimResultsPage projectId={route.projectId} runId={route.runId} />;
```

- [ ] **Step 7: Run frontend checks**

Run:

```bash
cd frontend
npm run check:minsim
npm run verify
```

Expected:

```text
Minsim result fixture check passed (2 fixtures).
```

`npm run verify` exits with status `0`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/v2 frontend/scripts/check-minsim-result-fixtures.mjs frontend/package.json frontend/src/Root.tsx frontend/src/styles.css
git commit -m "feat: add minsim live results ux"
```

---

### Task 7: MCP Streamable HTTP Endpoint

**Files:**
- Create: `src/mcp/__init__.py`
- Create: `src/mcp/schemas.py`
- Create: `src/mcp/registry.py`
- Create: `src/mcp/http.py`
- Modify: `src/api/main.py`
- Create: `tests/test_mcp_http.py`
- Modify: `README.md`

**Interfaces:**
- Consumes:
  - `ProjectService`
  - Existing auth cookie/session helpers
  - FastAPI `Request`

- Produces:
  - Authenticated `/mcp` JSON-RPC endpoint.
  - Tools:
    - `list_projects`
    - `create_project`
    - `update_project`
    - `archive_project`
    - `get_project`
    - `list_project_runs`
    - `create_project_run`
    - `get_run_status`
    - `get_run_result`
    - `submit_run_feedback`
    - `export_run`
    - `ask_followup`
    - `start_interview`
    - `ask_interview_question`
  - Resources:
    - `koresim-v2://projects/{project_id}`
    - `koresim-v2://projects/{project_id}/runs`
    - `koresim-v2://runs/{run_id}/result`
    - `koresim-v2://runs/{run_id}/export`
  - Prompts:
    - `new-product-simulation`
    - `compare-creative-candidates`
    - `summarize-run-result`
    - `plan-followup-simulation`

- [ ] **Step 1: Write MCP HTTP tests**

Create `tests/test_mcp_http.py`:

```python
from fastapi.testclient import TestClient

from src.api.main import create_app
from src.jobs.store import SQLiteRunStore


def _auth_env(monkeypatch, email: str = "mcp@example.com") -> None:
    monkeypatch.setenv("KORESIM_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("KORESIM_AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("KORESIM_AUTH_TEST_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KORESIM_AUTH_LOCAL_DEV_AUTO_LOGIN", "false")
    monkeypatch.setenv("KORESIM_AUTH_TEST_EMAIL", email)


def _rpc(method: str, params: dict | None = None) -> dict:
    return {"jsonrpc": "2.0", "id": "test-1", "method": method, "params": params or {}}


def test_mcp_rejects_unauthenticated_http(monkeypatch, tmp_path) -> None:
    _auth_env(monkeypatch)
    monkeypatch.setenv("KORESIM_AUTH_REQUIRED", "true")
    client = TestClient(create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")))

    response = client.post("/mcp", json=_rpc("tools/list"))

    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"


def test_mcp_lists_tools_for_authenticated_user(monkeypatch, tmp_path) -> None:
    _auth_env(monkeypatch)
    client = TestClient(create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3")))
    assert client.get("/api/auth/test-login", follow_redirects=False).status_code == 303

    response = client.post("/mcp", json=_rpc("tools/list"))

    assert response.status_code == 200
    names = {tool["name"] for tool in response.json()["result"]["tools"]}
    assert {"list_projects", "create_project", "create_project_run", "get_run_result", "ask_followup"} <= names


def test_mcp_create_and_list_projects(monkeypatch, tmp_path) -> None:
    _auth_env(monkeypatch)
    client = TestClient(create_app(store=SQLiteRunStore(tmp_path / "runs.sqlite3"), enqueue_run_func=lambda run_id: f"job-{run_id}"))
    client.get("/api/auth/test-login", follow_redirects=False)

    created = client.post(
        "/mcp",
        json=_rpc("tools/call", {"name": "create_project", "arguments": {"name": "MCP Project"}}),
    )
    assert created.status_code == 200
    assert created.json()["result"]["content"][0]["type"] == "json"
    assert created.json()["result"]["content"][0]["json"]["name"] == "MCP Project"

    listed = client.post("/mcp", json=_rpc("tools/call", {"name": "list_projects", "arguments": {}}))
    assert listed.status_code == 200
    assert listed.json()["result"]["content"][0]["json"]["projects"][0]["name"] == "MCP Project"
```

- [ ] **Step 2: Run failing MCP tests**

Run:

```bash
uv run pytest tests/test_mcp_http.py -q
```

Expected:

```text
FAILED tests/test_mcp_http.py::test_mcp_rejects_unauthenticated_http - assert 404 == 401
FAILED tests/test_mcp_http.py::test_mcp_lists_tools_for_authenticated_user - assert 404 == 200
FAILED tests/test_mcp_http.py::test_mcp_create_and_list_projects - assert 404 == 200
```

- [ ] **Step 3: Add MCP schemas**

Create `src/mcp/__init__.py`:

```python
"""MCP endpoint integration for koresim-v2."""
```

Create `src/mcp/schemas.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from src.jobs.models import UserRecord
from src.jobs.store import SQLiteRunStore


@dataclass(frozen=True)
class McpContext:
    store: SQLiteRunStore
    user: UserRecord
    enqueue_run: Callable[[str], str]
    llm_client: Any | None = None


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[McpContext, dict[str, Any]], Any]
```

- [ ] **Step 4: Add MCP registry**

Create `src/mcp/registry.py`:

```python
from __future__ import annotations

from typing import Any

from src.api.schemas import ProjectCreateRequest, ProjectRunCreateRequest, ProjectRunFollowupRequest, ProjectRunInterviewRequest, ProjectUpdateRequest, RunFeedbackRequest
from src.mcp.schemas import McpContext, ToolDefinition
from src.services.project_service import ProjectService


def list_tools() -> list[ToolDefinition]:
    return [
        ToolDefinition("list_projects", "List owned projects.", {"type": "object", "properties": {}}, _list_projects),
        ToolDefinition("create_project", "Create a project.", _schema(["name"]), _create_project),
        ToolDefinition("update_project", "Update a project.", _schema(["project_id"]), _update_project),
        ToolDefinition("archive_project", "Archive a project.", _schema(["project_id"]), _archive_project),
        ToolDefinition("get_project", "Read a project.", _schema(["project_id"]), _get_project),
        ToolDefinition("list_project_runs", "List runs in a project.", _schema(["project_id"]), _list_project_runs),
        ToolDefinition("create_project_run", "Create a run in a project.", _schema(["project_id", "simulation_type", "input"]), _create_project_run),
        ToolDefinition("get_run_status", "Get a run snapshot.", _schema(["run_id"]), _get_run_status),
        ToolDefinition("get_run_result", "Get a run result through project ownership.", _schema(["project_id", "run_id"]), _get_run_result),
        ToolDefinition("submit_run_feedback", "Submit feedback for a project run.", _schema(["project_id", "run_id"]), _submit_run_feedback),
        ToolDefinition("export_run", "Export a redacted run result.", _schema(["project_id", "run_id"]), _export_run),
        ToolDefinition("ask_followup", "Ask a same-panel follow-up question.", _schema(["project_id", "run_id", "question"]), _ask_followup),
        ToolDefinition("start_interview", "Start an interview by asking the first question.", _schema(["project_id", "run_id", "question"]), _ask_interview_question),
        ToolDefinition("ask_interview_question", "Ask a persona interview question.", _schema(["project_id", "run_id", "question"]), _ask_interview_question),
    ]


def list_prompts() -> list[dict[str, Any]]:
    return [
        {"name": "new-product-simulation", "description": "Plan a new product simulation."},
        {"name": "compare-creative-candidates", "description": "Compare creative candidates with KoreaSim."},
        {"name": "summarize-run-result", "description": "Summarize a completed run result."},
        {"name": "plan-followup-simulation", "description": "Plan a follow-up simulation from a result."},
    ]


def read_resource(ctx: McpContext, uri: str) -> dict[str, Any]:
    service = _service(ctx)
    if uri.startswith("koresim-v2://projects/") and uri.endswith("/runs"):
        project_id = uri.removeprefix("koresim-v2://projects/").removesuffix("/runs").strip("/")
        return service.list_project_runs(ctx.user, project_id).model_dump(mode="json")
    if uri.startswith("koresim-v2://projects/"):
        project_id = uri.removeprefix("koresim-v2://projects/").strip("/")
        return service.get_project(ctx.user, project_id).model_dump(mode="json")
    if uri.startswith("koresim-v2://runs/") and uri.endswith("/result"):
        run_id = uri.removeprefix("koresim-v2://runs/").removesuffix("/result").strip("/")
        project = ctx.store.get_project_for_run(run_id)
        if project is None:
            raise ValueError("Run has no project.")
        return service.get_project_run_result(ctx.user, project.project_id, run_id).model_dump(mode="json")
    if uri.startswith("koresim-v2://runs/") and uri.endswith("/export"):
        run_id = uri.removeprefix("koresim-v2://runs/").removesuffix("/export").strip("/")
        project = ctx.store.get_project_for_run(run_id)
        if project is None:
            raise ValueError("Run has no project.")
        return service.export_project_run(ctx.user, project.project_id, run_id).model_dump(mode="json")
    raise ValueError(f"Unknown resource URI: {uri}")


def call_tool(ctx: McpContext, name: str, arguments: dict[str, Any]) -> Any:
    tools = {tool.name: tool for tool in list_tools()}
    if name not in tools:
        raise ValueError(f"Unknown tool: {name}")
    return tools[name].handler(ctx, arguments)


def _service(ctx: McpContext) -> ProjectService:
    return ProjectService(ctx.store, enqueue_run=ctx.enqueue_run)


def _schema(required: list[str]) -> dict[str, Any]:
    return {"type": "object", "required": required, "properties": {key: {"type": "string"} for key in required}}


def _json(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _list_projects(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).list_projects(ctx.user).model_dump(mode="json")


def _create_project(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).create_project(ctx.user, ProjectCreateRequest.model_validate(arguments)).model_dump(mode="json")


def _update_project(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = str(arguments["project_id"])
    payload = {key: value for key, value in arguments.items() if key != "project_id"}
    return _service(ctx).update_project(ctx.user, project_id, ProjectUpdateRequest.model_validate(payload)).model_dump(mode="json")


def _archive_project(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).archive_project(ctx.user, str(arguments["project_id"])).model_dump(mode="json")


def _get_project(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).get_project(ctx.user, str(arguments["project_id"])).model_dump(mode="json")


def _list_project_runs(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).list_project_runs(ctx.user, str(arguments["project_id"])).model_dump(mode="json")


def _create_project_run(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = str(arguments["project_id"])
    payload = {key: value for key, value in arguments.items() if key != "project_id"}
    return _service(ctx).create_project_run(ctx.user, project_id, ProjectRunCreateRequest.model_validate(payload)).model_dump(mode="json")


def _get_run_status(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    run = ctx.store.get_run(str(arguments["run_id"]))
    if run is None or run.user_id != ctx.user.user_id:
        raise ValueError("Run was not found.")
    return {"run_id": run.run_id, "status": run.status.value, "done_count": run.done_count, "total_count": run.total_count}


def _get_run_result(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).get_project_run_result(ctx.user, str(arguments["project_id"]), str(arguments["run_id"])).model_dump(mode="json")


def _submit_run_feedback(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = str(arguments.pop("project_id"))
    run_id = str(arguments.pop("run_id"))
    return _service(ctx).submit_project_run_feedback(ctx.user, project_id, run_id, RunFeedbackRequest.model_validate(arguments)).model_dump(mode="json")


def _export_run(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).export_project_run(ctx.user, str(arguments["project_id"]), str(arguments["run_id"])).model_dump(mode="json")


def _ask_followup(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).ask_followup(
        ctx.user,
        str(arguments["project_id"]),
        str(arguments["run_id"]),
        ProjectRunFollowupRequest.model_validate(arguments),
        llm_client=ctx.llm_client,
    ).model_dump(mode="json")


def _ask_interview_question(ctx: McpContext, arguments: dict[str, Any]) -> dict[str, Any]:
    return _service(ctx).ask_interview_question(
        ctx.user,
        str(arguments["project_id"]),
        str(arguments["run_id"]),
        ProjectRunInterviewRequest.model_validate(arguments),
        llm_client=ctx.llm_client,
    ).model_dump(mode="json")
```

- [ ] **Step 5: Add MCP HTTP router**

Create `src/mcp/http.py`:

```python
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from src.api.auth import session_summary
from src.jobs.store import SQLiteRunStore
from src.mcp.registry import call_tool, list_prompts, list_tools, read_resource
from src.mcp.schemas import McpContext

router = APIRouter()


@router.post("/mcp")
async def mcp_endpoint(request: Request) -> JSONResponse:
    user_record = _mcp_user(request)
    if user_record is None:
        return JSONResponse(
            status_code=401,
            headers={"WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-protected-resource"'},
            content={"jsonrpc": "2.0", "id": None, "error": {"code": "AUTH_REQUIRED", "message": "Login is required."}},
        )

    body = await request.json()
    rpc_id = body.get("id")
    method = body.get("method")
    params = body.get("params") or {}
    ctx = McpContext(
        store=request.app.state.run_store,
        user=user_record,
        enqueue_run=request.app.state.enqueue_run,
        llm_client=request.app.state.llm_client,
    )

    try:
        if method == "tools/list":
            result = {"tools": [{"name": tool.name, "description": tool.description, "inputSchema": tool.input_schema} for tool in list_tools()]}
        elif method == "tools/call":
            value = call_tool(ctx, str(params.get("name")), params.get("arguments") or {})
            result = {"content": [{"type": "json", "json": value}]}
        elif method == "resources/read":
            value = read_resource(ctx, str(params.get("uri")))
            result = {"contents": [{"uri": params.get("uri"), "mimeType": "application/json", "text": json.dumps(value, ensure_ascii=False)}]}
        elif method == "prompts/list":
            result = {"prompts": list_prompts()}
        else:
            return _rpc_error(rpc_id, "METHOD_NOT_FOUND", f"Unknown MCP method: {method}")
    except Exception as exc:
        return _rpc_error(rpc_id, "TOOL_ERROR", str(exc))

    return JSONResponse({"jsonrpc": "2.0", "id": rpc_id, "result": result})


def _rpc_error(rpc_id: Any, code: str, message: str) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message}})


def _mcp_user(request: Request):
    summary = session_summary(request)
    if not summary["authenticated"]:
        return None
    user = summary["user"]
    if user is None:
        return None
    store: SQLiteRunStore = request.app.state.run_store
    return store.upsert_user_from_auth(user)
```

- [ ] **Step 6: Mount MCP and public auth metadata**

Modify `src/api/main.py`:

```python
from src.mcp.http import router as mcp_router
```

After `app.include_router(router)`, add:

```python
    app.include_router(mcp_router)
```

Add metadata endpoint before `install_static_routes(app)`:

```python
    @app.get("/.well-known/oauth-protected-resource")
    async def oauth_protected_resource_metadata(request: Request):
        return {
            "resource": str(request.base_url).rstrip("/") + "/mcp",
            "authorization_servers": [str(request.base_url).rstrip("/")],
            "scopes_supported": ["openid", "email", "profile"],
        }
```

Update `_is_public_path` to include:

```python
        or path == "/mcp"
        or path == "/.well-known/oauth-protected-resource"
```

- [ ] **Step 7: Run MCP tests**

Run:

```bash
uv run pytest tests/test_mcp_http.py tests/test_project_api.py -q
```

Expected:

```text
passed
```

- [ ] **Step 8: Document MCP local usage**

In `README.md`, add:

```markdown
### MCP endpoint

`koresim-v2` exposes an authenticated MCP HTTP endpoint at `/mcp`.
The endpoint uses the same project service layer as the web app. In production,
authenticate through Google OAuth first. In local tests, enable
`KORESIM_AUTH_TEST_LOGIN_ENABLED=true` and call `/api/auth/test-login` before
posting JSON-RPC requests to `/mcp`.

Example:

```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H 'Content-Type: application/json' \
  --cookie 'koresim_session=...' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```
```

- [ ] **Step 9: Commit**

```bash
git add src/mcp src/api/main.py tests/test_mcp_http.py README.md
git commit -m "feat: add authenticated mcp endpoint"
```

---

### Task 8: End-to-End Verification and Default Switch QA

**Files:**
- Modify: `README.md`
- Modify: `frontend/src/Root.tsx` only if any route from Tasks 4-6 still renders the skeleton fallback for a V2 route.
- Modify: `docs/superpowers/specs/2026-07-10-minsim-v2-full-ux-design.md` only if a completed implementation intentionally differs from the approved spec and the implemented behavior is accepted by the project owner.

**Interfaces:**
- Consumes:
  - All prior tasks.
- Produces:
  - Verified default V2 route flow.
  - Preserved classic route flow.
  - Final implementation notes.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
uv run pytest tests/test_project_store.py tests/test_project_api.py tests/test_followup_service.py tests/test_mcp_http.py -q
```

Expected:

```text
passed
```

- [ ] **Step 2: Run full backend verification**

Run:

```bash
uv run python scripts/verify.py
```

Expected:

```text
Verification passed
```

If the script prints a different success line, record the exact line in the final task note.

- [ ] **Step 3: Run frontend verification**

Run:

```bash
cd frontend
npm run verify
```

Expected:

```text
Minsim result fixture check passed (2 fixtures).
```

The command exits with status `0`.

- [ ] **Step 4: Start local app for browser QA**

Terminal A:

```bash
uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

Expected:

```text
Uvicorn running on http://127.0.0.1:8000
```

Terminal B:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected:

```text
Local: http://127.0.0.1:5173/
```

- [ ] **Step 5: Browser QA route checks**

Open these URLs:

```text
http://127.0.0.1:5173/app
http://127.0.0.1:5173/projects
http://127.0.0.1:5173/classic/app
http://127.0.0.1:5173/classic/results
```

Expected:

- `/app` and `/projects` show the minsim-style project UX.
- `/classic/app` shows the original koresim app.
- `/classic/results` shows the original koresim result page behavior.
- No route shows the Task 4 skeleton text `V2 화면을 불러오는 중입니다.`.

- [ ] **Step 6: Browser QA live flow**

Using the V2 UI:

1. Create a project named `QA V2 Project`.
2. Open the project.
3. Fill product context fields.
4. Select `크리에이티브 비교`.
5. Complete intake with two candidate messages.
6. Start a run.
7. Confirm the loading page receives progress from `/api/runs/{run_id}/events`.
8. Confirm `/results?project_id=...&run_id=...` renders real metrics and persona evidence.
9. Submit a follow-up question from the result page.
10. Export JSON and confirm `raw_results_included` is `false`.

Expected:

- The run is persisted in SQLite and listed under the project.
- The result page is not using minsim mock globals.
- Follow-up response includes answer cards.
- Export file uses schema `koresim-export/v1`.

- [ ] **Step 7: MCP smoke test**

After logging in locally, call:

```bash
curl -s -X POST http://127.0.0.1:8000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

Expected when unauthenticated:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":"AUTH_REQUIRED","message":"Login is required."}}
```

After authenticating with a browser session or a test cookie, expected result includes:

```json
{"name":"list_projects"}
```

- [ ] **Step 8: Final git status check**

Run:

```bash
git status --short
```

Expected:

```text
 M ...
?? ...
```

Only files from this plan should be changed in the task branch. Existing unrelated vault changes outside `koresim-v2` must remain unstaged.

- [ ] **Step 9: Final commit**

```bash
git add README.md docs/superpowers/specs/2026-07-10-minsim-v2-full-ux-design.md frontend/src/Root.tsx
git commit -m "docs: verify minsim v2 flow"
```

If none of those files changed in Task 8, skip the commit and record `No Task 8 code/doc changes`.

---

## Self-Review Notes

- Spec coverage: Tasks 1-3 cover project persistence, web APIs, ownership, feedback/export/follow-up/interview, and shared services. Tasks 4-6 cover default minsim-style UX, classic route preservation, live intake, loading, and result adapter. Task 7 covers MCP tools, resources, prompts, and authenticated HTTP transport. Task 8 covers final route switch and verification.
- Type consistency: backend project IDs use `project_id`; frontend mirrors snake-case API properties to match existing API style. Result adapter signature is exactly `resultToMinsimView(result: RunResultEnvelope, snapshot?: RunSnapshot | null): MinsimReportView`.
- Execution order: do not start frontend Tasks 5-6 until Task 2 APIs pass. Do not start MCP Task 7 until Task 3 service methods pass, because MCP must not duplicate project/run authorization logic.
