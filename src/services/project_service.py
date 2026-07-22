from __future__ import annotations

from collections.abc import Callable
from typing import Any

from src.simulations.kind_policy import allows_country, allows_simulation, default_persona_pool

from src.api.schemas import (
    ErrorCode,
    ErrorResponse,
    InterviewMessageResponse,
    InterviewThreadCreateRequest,
    InterviewThreadListResponse,
    InterviewThreadMessageRequest,
    InterviewThreadResponse,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectRunCreateRequest,
    ProjectRunCreateResponse,
    ProjectRunFollowupRequest,
    ProjectRunPersuasionRequest,
    ProjectRunPersuasionResponse,
    ProjectRunFollowupResponse,
    ProjectRunInterviewRequest,
    ProjectRunInterviewResponse,
    ProjectRunItem,
    ProjectRunListResponse,
    ProjectUpdateRequest,
    RunCreateRequest,
    RunExportResponse,
    RunFeedbackRequest,
    RunFeedbackResponse,
    RunResultEnvelope,
    RunSnapshot,
    RunStatus,
    SimulationType,
)
from src.jobs.models import InterviewThreadRecord, ProjectRecord, RunRecord, UserRecord
from src.jobs.store import SQLiteRunStore
from src.services.errors import ServiceError, require_authenticated_user
from src.services.export_service import build_run_export_response
from src.services.followup_service import build_interview_anchor, run_followup, run_interview_turn
from src.services.llm_usage_service import consume_interactive_llm_action
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
        country_id=getattr(run, "country_id", None) or "kr",
        persona_pool=getattr(run, "persona_pool", None) or "nationwide",
        created_at=run.created_at,
        started_at=run.started_at,
        updated_at=run.updated_at,
        completed_at=run.completed_at,
        error=ErrorResponse.model_validate(run.error) if run.error else None,
        result_available=result_available,
    )


def interview_thread_response(store: SQLiteRunStore, record: InterviewThreadRecord) -> InterviewThreadResponse:
    messages = [
        InterviewMessageResponse(
            message_id=message.message_id,
            role=message.role,
            content=message.content,
            ordinal=message.ordinal,
            metadata=message.metadata,
            created_at=message.created_at,
        )
        for message in store.list_interview_messages(record.thread_id)
    ]
    return InterviewThreadResponse(
        thread_id=record.thread_id,
        project_id=record.project_id,
        run_id=record.run_id,
        subject_uuid=record.subject_uuid,
        subject_label=record.subject_label,
        subject_meta=record.subject_meta,
        context_quote=record.context_quote,
        messages=messages,
        created_at=record.created_at,
        updated_at=record.updated_at,
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
        project = self._owned_project(user, project_id)
        self._enforce_kind_policy(project, payload)
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
        # persona_pool을 안 보내면 스키마 기본값(nationwide)이 채워진다.
        # 여론조사 프로젝트가 조용히 전국 페르소나로 도는 것을 막는다.
        if "persona_pool" not in payload.model_fields_set:
            run_payload["persona_pool"] = default_persona_pool(project.kind)
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

    def _enforce_kind_policy(self, project: Any, payload: ProjectRunCreateRequest) -> None:
        """갈래에 맞지 않는 시뮬레이션·국가를 서버에서 거절한다.

        이 규칙은 원래 프론트엔드 상수 파일에만 있어서, API나 MCP로 직접 호출하면
        아무 검증 없이 통과했다.
        """
        kind = getattr(project, "kind", None)
        if not allows_simulation(kind, payload.simulation_type):
            raise ServiceError(
                status_code=422,
                code=ErrorCode.UNSUPPORTED_SIMULATION_TYPE,
                message=(
                    f"Simulation '{payload.simulation_type}' is not available for "
                    f"'{kind}' projects."
                ),
            )
        if not allows_country(kind, payload.country_id):
            raise ServiceError(
                status_code=422,
                code=ErrorCode.INVALID_REQUEST,
                message=f"Country '{payload.country_id}' is not available for '{kind}' projects.",
            )

    def get_project_run_result(self, user: UserRecord | None, project_id: str, run_id: str) -> RunResultEnvelope:
        run = self._owned_project_run(user, project_id, run_id)
        result = self.store.get_result(run.run_id)
        if result is None:
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={
                    "run_id": run_id,
                    "status": run.status.value,
                    "done_count": run.done_count,
                    "total_count": run.total_count,
                    "partial_count": len(self.store.list_partial_results(run.run_id)),
                },
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
        user = require_authenticated_user(user)
        run = self._owned_project_run(user, project_id, run_id)
        consume_interactive_llm_action(
            store=self.store,
            user=user,
            action_type="project_followup",
        )
        result = self.store.get_result(run_id)
        if result is None:
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run_id, "status": run.status.value},
            )
        body = run_followup(
            original_run={
                "run_id": run.run_id,
                "simulation_type": run.simulation_type,
                "seed": run.seed,
                "sample_size": run.sample_size,
                "target_filter": run.target_filter,
                "input": run.input,
                "country_id": getattr(run, "country_id", None) or "kr",
            },
            question=payload.question,
            cohort=payload.cohort,
            raw_results=result.result.get("raw_results") or [],
            sample_size=payload.sample_size,
            llm_client=llm_client,
        )
        return ProjectRunFollowupResponse.model_validate(body)

    def run_persuasion(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: ProjectRunPersuasionRequest,
        llm_client: object | None = None,
    ) -> ProjectRunPersuasionResponse:
        """반대자에게만 조건을 제시해 전환율을 낸다."""
        from src.services.persuasion_service import run_persuasion as _run

        user = require_authenticated_user(user)
        run = self._owned_project_run(user, project_id, run_id)
        consume_interactive_llm_action(
            store=self.store, user=user, action_type="project_followup"
        )
        result = self.store.get_result(run_id)
        if result is None:
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run_id, "status": run.status.value},
            )
        body = _run(
            original_run={
                "run_id": run.run_id,
                "simulation_type": run.simulation_type,
                "seed": run.seed,
                "sample_size": run.sample_size,
                "input": run.input,
                "country_id": getattr(run, "country_id", None) or "kr",
            },
            condition=payload.condition,
            raw_results=result.result.get("raw_results") or [],
            sample_size=payload.sample_size,
            llm_client=llm_client,
        )
        return ProjectRunPersuasionResponse.model_validate(body)

    def ask_interview_question(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: ProjectRunInterviewRequest,
        llm_client: object | None = None,
    ) -> ProjectRunInterviewResponse:
        followup = self.ask_followup(
            user,
            project_id,
            run_id,
            ProjectRunFollowupRequest(
                question=payload.question,
                cohort=payload.subject_uuid or "all",
                sample_size=payload.sample_size,
            ),
            llm_client=llm_client,
        )
        return ProjectRunInterviewResponse(
            subject_uuid=payload.subject_uuid,
            question=payload.question,
            answers=followup.answers,
            summary=followup.summary,
        )

    def list_interview_threads(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
    ) -> InterviewThreadListResponse:
        user = require_authenticated_user(user)
        self._owned_project_run(user, project_id, run_id)
        records = self.store.list_interview_threads(user_id=user.user_id, run_id=run_id)
        return InterviewThreadListResponse(
            threads=[interview_thread_response(self.store, record) for record in records]
        )

    def create_interview_thread(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        payload: InterviewThreadCreateRequest,
    ) -> InterviewThreadResponse:
        user = require_authenticated_user(user)
        run = self._owned_project_run(user, project_id, run_id)
        result = self._ready_result(run)
        subject = self._raw_subject(result.result.get("raw_results") or [], payload.subject_uuid)
        enriched_quote = build_interview_anchor(subject, payload.context_quote)
        record = self.store.get_or_create_interview_thread(
            user_id=user.user_id,
            project_id=project_id,
            run_id=run_id,
            subject_uuid=payload.subject_uuid,
            subject_label=payload.subject_label,
            subject_meta=payload.subject_meta,
            context_quote=enriched_quote,
        )
        return interview_thread_response(self.store, record)

    def ask_interview_thread_question(
        self,
        user: UserRecord | None,
        project_id: str,
        run_id: str,
        thread_id: str,
        payload: InterviewThreadMessageRequest,
        llm_client: object | None = None,
    ) -> InterviewThreadResponse:
        user = require_authenticated_user(user)
        run = self._owned_project_run(user, project_id, run_id)
        consume_interactive_llm_action(
            store=self.store,
            user=user,
            action_type="interview_message",
        )
        thread = self.store.get_interview_thread(user_id=user.user_id, thread_id=thread_id)
        if thread is None or thread.project_id != project_id or thread.run_id != run_id:
            raise ServiceError(
                status_code=404,
                code=ErrorCode.RUN_NOT_FOUND,
                message="Interview thread was not found.",
                details={"project_id": project_id, "run_id": run_id, "thread_id": thread_id},
            )
        result = self._ready_result(run)
        self._raw_subject(result.result.get("raw_results") or [], thread.subject_uuid)
        history = [message.__dict__ for message in self.store.list_interview_messages(thread_id)]
        try:
            turn = run_interview_turn(
                raw_results=result.result.get("raw_results") or [],
                subject_uuid=thread.subject_uuid,
                question=payload.question,
                history=history,
                context_quote=thread.context_quote,
                original_run={
                    "run_id": run.run_id,
                    "simulation_type": run.simulation_type,
                    "input": run.input,
                    "seed": run.seed,
                    "sample_size": run.sample_size,
                    "target_filter": run.target_filter,
                },
                llm_client=llm_client,
                trace_metadata={
                    "run_id": run.run_id,
                    "simulation_type": run.simulation_type,
                },
            )
        except ValueError as exc:
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message="The selected respondent is not available in this run.",
                details={"subject_uuid": thread.subject_uuid},
            ) from exc
        self.store.append_interview_exchange(
            user_id=user.user_id,
            thread_id=thread_id,
            question=payload.question,
            answer=turn["answer"],
            assistant_metadata={
                "provider": turn.get("provider"),
                "provider_model": turn.get("provider_model"),
                "trace_id": turn.get("trace_id"),
            },
        )
        updated = self.store.get_interview_thread(user_id=user.user_id, thread_id=thread_id)
        if updated is None:
            raise RuntimeError(f"Interview thread disappeared: {thread_id}")
        self.store.record_analytics_event(
            event_name="interview_message_sent",
            user=user,
            run_id=run_id,
            page="/results",
            simulation_type=run.simulation_type,
            payload={"project_id": project_id, "thread_id": thread_id},
        )
        return interview_thread_response(self.store, updated)

    def _ready_result(self, run: RunRecord):
        result = self.store.get_result(run.run_id)
        if result is None:
            raise ServiceError(
                status_code=409,
                code=ErrorCode.RESULT_NOT_READY,
                message="Run result is not ready yet.",
                details={"run_id": run.run_id, "status": run.status.value},
            )
        return result

    @staticmethod
    def _raw_subject(raw_results: list[dict], subject_uuid: str) -> dict:
        subject = next(
            (
                item
                for item in raw_results
                if str(item.get("uuid") or (item.get("persona") or {}).get("uuid") or "") == subject_uuid
            ),
            None,
        )
        if subject is None:
            raise ServiceError(
                status_code=400,
                code=ErrorCode.INVALID_REQUEST,
                message="The selected respondent is not available in this run.",
                details={"subject_uuid": subject_uuid},
            )
        return subject

    def _owned_project(self, user: UserRecord | None, project_id: str) -> ProjectRecord:
        user = require_authenticated_user(user)
        project = self.store.get_project(project_id)
        if project is None or project.user_id != user.user_id or project.archived_at is not None:
            raise self._not_found(project_id)
        return project

    def _owned_project_run(self, user: UserRecord | None, project_id: str, run_id: str) -> RunRecord:
        user = require_authenticated_user(user)
        self._owned_project(user, project_id)
        link = self.store.get_project_run(project_id, run_id)
        run = self.store.get_run(run_id)
        if link is None or run is None or run.user_id != user.user_id:
            raise ServiceError(
                status_code=404,
                code=ErrorCode.RUN_NOT_FOUND,
                message="Run was not found.",
                details={"project_id": project_id, "run_id": run_id},
            )
        return run

    @staticmethod
    def _not_found(project_id: str) -> ServiceError:
        return ServiceError(
            status_code=404,
            code=ErrorCode.RUN_NOT_FOUND,
            message="Project was not found.",
            details={"project_id": project_id},
        )
