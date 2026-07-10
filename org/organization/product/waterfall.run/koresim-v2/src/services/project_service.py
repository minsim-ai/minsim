from __future__ import annotations

from collections.abc import Callable

from src.api.schemas import (
    ErrorCode,
    ErrorResponse,
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
    RunStatus,
    SimulationType,
)
from src.jobs.models import ProjectRecord, RunRecord, UserRecord
from src.jobs.store import SQLiteRunStore
from src.services.errors import ServiceError, require_authenticated_user
from src.services.run_service import create_run_for_user


def project_response(record: ProjectRecord) -> ProjectResponse:
    return ProjectResponse.model_validate(record.__dict__)


def snapshot_from_run(run: RunRecord, result_available: bool) -> RunSnapshot:
    progress = 100.0 if run.total_count <= 0 else round((run.done_count / run.total_count) * 100, 2)
    return RunSnapshot(
        run_id=run.run_id,
        simulation_type=SimulationType(run.simulation_type),
        status=RunStatus(run.status.value),
        sample_size=run.sample_size,
        done_count=run.done_count,
        total_count=run.total_count,
        progress_pct=max(0, min(100, progress)),
        created_at=run.created_at,
        started_at=run.started_at,
        updated_at=run.updated_at,
        completed_at=run.completed_at,
        error=ErrorResponse.model_validate(run.error) if run.error else None,
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

    def update_project(
        self,
        user: UserRecord | None,
        project_id: str,
        payload: ProjectUpdateRequest,
    ) -> ProjectResponse:
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
            raise ServiceError(
                status_code=503,
                code=ErrorCode.QUEUE_UNAVAILABLE,
                message="Worker queue is unavailable.",
            )

        run_payload = payload.model_dump(
            mode="json",
            exclude={"run_label", "derived_from_run_id"},
            exclude_none=True,
        )
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
