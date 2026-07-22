"""MCP tool/resource registry backed by the existing project services."""
from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from src.api.schemas import (
    ProjectCreateRequest,
    ProjectRunCreateRequest,
    ProjectRunFollowupRequest,
    ProjectRunInterviewRequest,
    RunFeedbackRequest,
)
from src.jobs.models import UserRecord
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMClientProtocol
from src.services.project_service import ProjectService


@dataclass(frozen=True)
class McpExecutionContext:
    store: SQLiteRunStore
    user: UserRecord
    enqueue_run: Callable[[str], str] | None = None
    llm_client: LLMClientProtocol | None = None


@dataclass(frozen=True)
class McpTool:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[McpExecutionContext, dict[str, Any]], Any]


class ProjectIdArgs(BaseModel):
    project_id: str = Field(min_length=1)


class ProjectRunArgs(ProjectIdArgs):
    run_id: str = Field(min_length=1)


class CreateProjectArgs(ProjectCreateRequest):
    pass


class CreateProjectRunArgs(ProjectRunCreateRequest):
    project_id: str = Field(min_length=1)


class SubmitFeedbackArgs(ProjectRunArgs):
    intake_session_id: str | None = None
    usefulness_score: int | None = Field(default=None, ge=1, le=5)
    trust_score: int | None = Field(default=None, ge=1, le=5)
    actionability_score: int | None = Field(default=None, ge=1, le=5)
    result_expectation: str | None = None
    free_text: str | None = None
    intended_action: str | None = None
    decision_confidence_before: int | None = Field(default=None, ge=1, le=5)
    decision_confidence_after: int | None = Field(default=None, ge=1, le=5)
    shared_with_team: bool = False
    exported_report: bool = False


class FollowupArgs(ProjectRunArgs):
    question: str = Field(min_length=1, max_length=500)
    cohort: str = Field(default="all", max_length=80)
    sample_size: int = Field(default=12, ge=1, le=50)


class InterviewArgs(ProjectRunArgs):
    subject_uuid: str | None = Field(default=None, max_length=160)
    question: str = Field(min_length=1, max_length=500)
    sample_size: int = Field(default=1, ge=1, le=10)


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "inputSchema": tool.input_schema,
        }
        for tool in _TOOLS
    ]


def call_tool(ctx: McpExecutionContext, name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
    tool = next((item for item in _TOOLS if item.name == name), None)
    if tool is None:
        raise KeyError(name)
    value = tool.handler(ctx, arguments or {})
    return _tool_result(_jsonable(value))


def list_resources(ctx: McpExecutionContext) -> list[dict[str, Any]]:
    projects = _service(ctx).list_projects(ctx.user).projects
    resources = [
        {
            "uri": "koresim://projects",
            "name": "KoreaSim projects",
            "description": "Authenticated user's active KoreaSim projects.",
            "mimeType": "application/json",
        }
    ]
    resources.extend(
        {
            "uri": f"koresim://projects/{project.project_id}",
            "name": project.name,
            "description": project.description or "Project detail",
            "mimeType": "application/json",
        }
        for project in projects[:50]
    )
    return resources


def read_resource(ctx: McpExecutionContext, uri: str) -> dict[str, Any]:
    parts = _resource_parts(uri)
    service = _service(ctx)
    if parts == ["projects"]:
        value = service.list_projects(ctx.user)
    elif len(parts) == 2 and parts[0] == "projects":
        value = service.get_project(ctx.user, parts[1])
    elif len(parts) == 3 and parts[0] == "projects" and parts[2] == "runs":
        value = service.list_project_runs(ctx.user, parts[1])
    elif len(parts) == 5 and parts[0] == "projects" and parts[2] == "runs" and parts[4] == "export":
        value = service.export_project_run(ctx.user, parts[1], parts[3])
    else:
        raise KeyError(uri)
    return _resource_result(uri, _jsonable(value))


def list_prompts() -> list[dict[str, Any]]:
    return [
        {
            "name": "koresim-result-review",
            "description": "Review a KoreaSim project run and propose follow-up questions.",
            "arguments": [
                {"name": "project_id", "description": "Project ID", "required": True},
                {"name": "run_id", "description": "Run ID", "required": True},
            ],
        }
    ]


def get_prompt(name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    if name != "koresim-result-review":
        raise KeyError(name)
    args = arguments or {}
    project_id = str(args.get("project_id") or "<project_id>")
    run_id = str(args.get("run_id") or "<run_id>")
    return {
        "description": "KoreaSim result review prompt",
        "messages": [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": (
                        "Read koresim://projects/"
                        f"{project_id}/runs/{run_id}/export, summarize the decision, "
                        "then propose one follow-up question and one interview question."
                    ),
                },
            }
        ],
    }


def _service(ctx: McpExecutionContext) -> ProjectService:
    return ProjectService(ctx.store, enqueue_run=ctx.enqueue_run)


def _create_project(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = CreateProjectArgs.model_validate(arguments)
    return _service(ctx).create_project(ctx.user, payload)


def _create_project_run(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = CreateProjectRunArgs.model_validate(arguments)
    project_id = payload.project_id
    run_payload = ProjectRunCreateRequest.model_validate(
        payload.model_dump(mode="json", exclude={"project_id"}, exclude_none=True)
    )
    return _service(ctx).create_project_run(ctx.user, project_id, run_payload)


def _list_projects(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    _validate_empty(arguments)
    return _service(ctx).list_projects(ctx.user)


def _get_project(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = ProjectIdArgs.model_validate(arguments)
    return _service(ctx).get_project(ctx.user, payload.project_id)


def _list_project_runs(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = ProjectIdArgs.model_validate(arguments)
    return _service(ctx).list_project_runs(ctx.user, payload.project_id)


def _export_run(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = ProjectRunArgs.model_validate(arguments)
    return _service(ctx).export_project_run(ctx.user, payload.project_id, payload.run_id)


def _submit_feedback(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = SubmitFeedbackArgs.model_validate(arguments)
    feedback = RunFeedbackRequest.model_validate(
        payload.model_dump(mode="json", exclude={"project_id", "run_id"}, exclude_none=True)
    )
    return _service(ctx).submit_project_run_feedback(ctx.user, payload.project_id, payload.run_id, feedback)


def _ask_followup(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = FollowupArgs.model_validate(arguments)
    followup = ProjectRunFollowupRequest.model_validate(
        payload.model_dump(mode="json", exclude={"project_id", "run_id"}, exclude_none=True)
    )
    return _service(ctx).ask_followup(
        ctx.user,
        payload.project_id,
        payload.run_id,
        followup,
        llm_client=ctx.llm_client,
    )


def _ask_interview(ctx: McpExecutionContext, arguments: dict[str, Any]) -> Any:
    payload = InterviewArgs.model_validate(arguments)
    interview = ProjectRunInterviewRequest.model_validate(
        payload.model_dump(mode="json", exclude={"project_id", "run_id"}, exclude_none=True)
    )
    return _service(ctx).ask_interview_question(
        ctx.user,
        payload.project_id,
        payload.run_id,
        interview,
        llm_client=ctx.llm_client,
    )


def _validate_empty(arguments: dict[str, Any]) -> None:
    if arguments:
        raise ValueError("This tool does not accept arguments.")


def _resource_parts(uri: str) -> list[str]:
    if not uri.startswith("koresim://"):
        raise KeyError(uri)
    rest = uri.removeprefix("koresim://")
    return [part for part in rest.split("/") if part]


def _tool_result(value: Any) -> dict[str, Any]:
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(value, ensure_ascii=False, indent=2),
            }
        ],
        "structuredContent": value,
    }


def _resource_result(uri: str, value: Any) -> dict[str, Any]:
    return {
        "contents": [
            {
                "uri": uri,
                "mimeType": "application/json",
                "text": json.dumps(value, ensure_ascii=False, indent=2),
            }
        ]
    }


def _jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    return value


def _schema(model: type[BaseModel]) -> dict[str, Any]:
    return model.model_json_schema()


_TOOLS = [
    McpTool(
        name="koresim.list_projects",
        description="List active projects owned by the authenticated KoreaSim user.",
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
        handler=_list_projects,
    ),
    McpTool(
        name="koresim.create_project",
        description="Create a project that stores shared product context for future simulation runs.",
        input_schema=_schema(CreateProjectArgs),
        handler=_create_project,
    ),
    McpTool(
        name="koresim.get_project",
        description="Read one authenticated user's project.",
        input_schema=_schema(ProjectIdArgs),
        handler=_get_project,
    ),
    McpTool(
        name="koresim.list_project_runs",
        description="List simulation runs attached to a project.",
        input_schema=_schema(ProjectIdArgs),
        handler=_list_project_runs,
    ),
    McpTool(
        name="koresim.create_project_run",
        description="Create a simulation run inside a project using the normal KoreaSim queue.",
        input_schema=_schema(CreateProjectRunArgs),
        handler=_create_project_run,
    ),
    McpTool(
        name="koresim.export_run",
        description="Export a redacted project run report without raw persona responses.",
        input_schema=_schema(ProjectRunArgs),
        handler=_export_run,
    ),
    McpTool(
        name="koresim.submit_feedback",
        description="Save user feedback about a project run result.",
        input_schema=_schema(SubmitFeedbackArgs),
        handler=_submit_feedback,
    ),
    McpTool(
        name="koresim.ask_followup",
        description="Ask a follow-up question to a cohort from an existing project run.",
        input_schema=_schema(FollowupArgs),
        handler=_ask_followup,
    ),
    McpTool(
        name="koresim.ask_interview",
        description="Ask one selected persona, or a small sample, an interview question from an existing run.",
        input_schema=_schema(InterviewArgs),
        handler=_ask_interview,
    ),
]


def validation_error_message(exc: ValidationError) -> str:
    return "; ".join(error["msg"] for error in exc.errors())
