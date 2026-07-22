"""React static serving helpers."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.config import PROJECT_ROOT

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
LONG_CACHE_SECONDS = 31_536_000


class CacheStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = f"public, max-age={LONG_CACHE_SECONDS}, immutable"
        return response


def install_static_routes(app: FastAPI, dist_dir: Path = FRONTEND_DIST) -> None:
    for directory_name in ("assets", "fonts", "landing", "lordicon", "maps", "organization", "persona"):
        directory = dist_dir / directory_name
        if directory.exists():
            app.mount(f"/{directory_name}", CacheStaticFiles(directory=directory), name=directory_name)

    @app.head("/{path:path}", include_in_schema=False)
    async def react_static_head(path: str = "") -> FileResponse:
        return _resolve_static_response(dist_dir, path)

    @app.get("/{path:path}", include_in_schema=False)
    async def react_static(path: str = "") -> FileResponse:
        return _resolve_static_response(dist_dir, path)


def _resolve_static_response(dist_dir: Path, path: str) -> FileResponse:
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    index = dist_dir / "index.html"
    if not index.exists():
        raise HTTPException(
            status_code=503,
            detail="React build not found. Run `cd frontend && npm run build`.",
        )

    requested = (dist_dir / path).resolve()
    dist_root = dist_dir.resolve()
    if requested.is_file() and requested.is_relative_to(dist_root):
        return _file_response(requested)
    directory_index = requested / "index.html"
    if directory_index.is_file() and directory_index.resolve().is_relative_to(dist_root):
        return _file_response(directory_index)

    return FileResponse(index)


def _file_response(path: Path) -> FileResponse:
    response = FileResponse(path)
    if path.name in {"robots.txt", "sitemap.xml"}:
        response.headers["Cache-Control"] = "public, max-age=3600"
    elif path.suffix in {".png", ".svg", ".webp", ".avif", ".woff2", ".js", ".css", ".wasm"}:
        response.headers["Cache-Control"] = f"public, max-age={LONG_CACHE_SECONDS}, immutable"
    return response
