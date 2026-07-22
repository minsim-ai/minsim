"""Shared OAuth constants for MCP Connect."""

from __future__ import annotations

MCP_SCOPE = "koresim:mcp"
ACCESS_TOKEN_TTL_SECONDS = 60 * 60
REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
AUTH_CODE_TTL_SECONDS = 60 * 5

MCP_TOOL_SUMMARIES = [
    {"name": "koresim.list_projects", "description": "List active projects owned by the user."},
    {"name": "koresim.create_project", "description": "Create a project with shared product context."},
    {"name": "koresim.get_project", "description": "Read one owned project."},
    {"name": "koresim.list_project_runs", "description": "List simulation runs for a project."},
    {
        "name": "koresim.create_project_run",
        "description": "Create a simulation run using the normal queue and quota.",
    },
    {
        "name": "koresim.export_run",
        "description": "Export a redacted project run report without raw persona responses.",
    },
    {"name": "koresim.submit_feedback", "description": "Save feedback about a project run result."},
    {
        "name": "koresim.ask_followup",
        "description": "Ask a follow-up question to a cohort from an existing run.",
    },
    {
        "name": "koresim.ask_interview",
        "description": "Interview one selected persona or a small sample from an existing run.",
    },
]
