import ast
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _python_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    return sorted(file for file in path.rglob("*.py") if "__pycache__" not in file.parts)


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module)
    return imports


def test_simulation_modules_do_not_import_api_jobs_or_infra() -> None:
    forbidden_prefixes = ("fastapi", "redis", "rq", "src.api", "src.jobs")
    offenders: list[str] = []

    for path in _python_files(PROJECT_ROOT / "src" / "simulations"):
        imports = _imports(path)
        for imported in imports:
            if imported.startswith(forbidden_prefixes):
                offenders.append(f"{path.relative_to(PROJECT_ROOT)} imports {imported}")

    assert offenders == []


def test_api_modules_do_not_import_provider_clients_directly() -> None:
    forbidden_prefixes = ("src.llm.client",)
    offenders: list[str] = []

    for path in _python_files(PROJECT_ROOT / "src" / "api"):
        imports = _imports(path)
        for imported in imports:
            if imported.startswith(forbidden_prefixes):
                offenders.append(f"{path.relative_to(PROJECT_ROOT)} imports {imported}")

    assert offenders == []
