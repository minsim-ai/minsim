"""React static serving helpers."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.config import PROJECT_ROOT

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def install_static_routes(app: FastAPI, dist_dir: Path = FRONTEND_DIST) -> None:
    for directory_name in ("assets", "fonts", "persona"):
        directory = dist_dir / directory_name
        if directory.exists():
            app.mount(f"/{directory_name}", StaticFiles(directory=directory), name=directory_name)

    @app.get("/{path:path}", include_in_schema=False)
    async def react_static(path: str = "") -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        index = dist_dir / "index.html"
        if not index.exists():
            raise HTTPException(
                status_code=503,
                detail="React build not found. Run `cd frontend && npm run build`.",
            )

        requested = (dist_dir / path).resolve()
        if requested.is_file() and requested.is_relative_to(dist_dir.resolve()):
            return FileResponse(requested)

        return FileResponse(index)
