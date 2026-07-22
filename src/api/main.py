"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import suppress
from urllib.parse import urlencode

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse, RedirectResponse

from src.api.auth import (
    auth_required,
    local_dev_auto_login_enabled,
    read_session_user,
    set_local_dev_session_cookie,
)
from src.api.routes import router
from src.api.security import (
    apply_security_headers,
    ensure_csrf_cookie,
    mutating_request_blocked,
)
from src.api.static import install_static_routes
from src.jobs.queue import enqueue_run
from src.jobs.store import SQLiteRunStore
from src.llm.base import LLMClientProtocol
from src.mcp.http import router as mcp_router
from src.oauth.authorization_server import router as oauth_router

logger = logging.getLogger("koresim.api")


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
    async def security_headers_and_csrf(request: Request, call_next):
        blocked = mutating_request_blocked(request)
        if blocked is not None:
            apply_security_headers(blocked)
            ensure_csrf_cookie(blocked, request)
            return blocked
        response = await call_next(request)
        apply_security_headers(response)
        # Keep a CSRF cookie available for same-origin SPA mutations.
        ensure_csrf_cookie(response, request)
        return response

    @app.middleware("http")
    async def require_app_session(request: Request, call_next):
        if not auth_required() or _is_public_path(request.url.path):
            return await call_next(request)
        if read_session_user(request):
            return await call_next(request)
        if local_dev_auto_login_enabled(request):
            response = await call_next(request)
            set_local_dev_session_cookie(response)
            return response
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
        # Brand login page first (Google-only). Soft SPA nav also uses /login.
        return RedirectResponse(
            url=f"/login?{urlencode({'next': next_url})}",
            status_code=303,
        )

    @app.exception_handler(RequestValidationError)
    async def log_validation_error(request: Request, exc: RequestValidationError):
        # 422s must be traceable after the fact (booth D-1): log which fields
        # failed and persist a redacted summary to analytics_events (/admin).
        errors = [
            {
                "loc": ".".join(str(part) for part in error.get("loc", [])),
                "type": str(error.get("type", "")),
            }
            for error in exc.errors()[:5]
        ]
        logger.warning(
            "422 validation error %s %s: %s", request.method, request.url.path, errors
        )
        with suppress(Exception):
            request.app.state.run_store.record_analytics_event(
                event_name="api_validation_error",
                user=None,
                run_id=None,
                page=request.url.path,
                simulation_type=None,
                payload={"method": request.method, "errors": errors},
            )
        return await request_validation_exception_handler(request, exc)

    app.include_router(router)
    app.include_router(oauth_router)
    app.include_router(mcp_router)
    install_static_routes(app)
    return app


app = create_app()


def _is_public_path(path: str) -> bool:
    return (
        path == "/"
        or path == "/login"
        or path == "/validation"
        or path in {"/robots.txt", "/sitemap.xml"}
        or path.startswith("/use-cases/")
        or path.startswith("/simulations/")
        or path.startswith("/compare/")
        or path.startswith("/api/auth/")
        or path in {"/api/health", "/api/config"}
        or path == "/mcp"
        or path.startswith("/.well-known/")
        or path.startswith("/oauth/")
        or path.startswith("/assets/")
        or path.startswith("/fonts/")
        or path.startswith("/landing/")
        or path.startswith("/lordicon/")
        or path.startswith("/maps/")
        or path.startswith("/organization/")
        or path.startswith("/persona/")
        or path
        in {
            "/favicon.ico",
            "/favicon.svg",
            "/favicon.png",
            "/favicon-32.png",
            "/favicon-64.png",
            "/logo-mark.png",
            "/logo-mark-512.png",
            "/OG_image.png",
        }
    )
