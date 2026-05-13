"""FastAPI application entrypoint."""
from __future__ import annotations

from collections.abc import Callable
from urllib.parse import urlencode

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse, RedirectResponse

from src.api.auth import auth_required, read_session_user
from src.api.routes import router
from src.api.static import install_static_routes
from src.jobs.queue import enqueue_run
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMClientProtocol


def create_app(
    *,
    store: SQLiteRunStore | None = None,
    enqueue_run_func: Callable[[str], str] | None = None,
    llm_client: LLMClientProtocol | None = None,
) -> FastAPI:
    app = FastAPI(title="Arabesque API", version="0.1.0")
    app.state.run_store = store or SQLiteRunStore()
    app.state.enqueue_run = enqueue_run_func or enqueue_run
    app.state.llm_client = llm_client

    @app.middleware("http")
    async def require_app_session(request: Request, call_next):
        if not auth_required() or _is_public_path(request.url.path):
            return await call_next(request)
        if read_session_user(request):
            return await call_next(request)
        if request.url.path.startswith("/api/"):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "AUTH_REQUIRED",
                        "message": "Login is required to use Arabesque.",
                    }
                },
            )
        next_url = request.url.path
        if request.url.query:
            next_url = f"{next_url}?{request.url.query}"
        return RedirectResponse(
            url=f"/api/auth/google/login?{urlencode({'next': next_url})}",
            status_code=303,
        )

    app.include_router(router)
    install_static_routes(app)
    return app


app = create_app()


def _is_public_path(path: str) -> bool:
    return (
        path == "/"
        or path == "/validation"
        or path.startswith("/api/auth/")
        or path in {"/api/health", "/api/config"}
        or path.startswith("/assets/")
        or path.startswith("/fonts/")
        or path in {"/favicon.ico", "/favicon.svg"}
    )
