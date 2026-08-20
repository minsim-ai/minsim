"""Run the deterministic development verification suite."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
PYTEST_COV_TARGETS = [
    "--cov=src/api",
    "--cov=src/jobs",
    "--cov=src/runtime",
    "--cov=src/simulations",
    "--cov=src/agent",
    "--cov=src/llm",
    "--cov=src/orchestration",
]


def run(command: list[str], cwd: Path = PROJECT_ROOT) -> None:
    print(f"+ {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip the production frontend build after typecheck.",
    )
    parser.add_argument(
        "--skip-e2e",
        action="store_true",
        help="Skip the Playwright booth journey (requires the frontend build).",
    )
    parser.add_argument(
        "--skip-dataset-tests",
        action="store_true",
        help=(
            "Skip tests marked requires_dataset (need real persona parquet "
            "data that isn't committed to git, e.g. the DGIST pool)."
        ),
    )
    args = parser.parse_args()

    try:
        # Block reintroduction of verification dumps, deploy plists, agent
        # sessions, and absolute local path leaks into the public tree.
        run(["uv", "run", "python", "scripts/check_public_tree_hygiene.py"])
        run(["uv", "run", "ruff", "check", "."])
        run(["uv", "run", "python", "evals/run_creative_fixture_eval.py"])
        run(["uv", "run", "python", "evals/run_result_envelope_fixture_eval.py"])
        run(["uv", "run", "python", "evals/run_agent_eval.py"])
        run(["uv", "run", "python", "evals/run_generic_suite_fixture_eval.py"])
        run(["uv", "run", "python", "evals/run_campus_policy_fixture_eval.py"])
        run(["uv", "run", "python", "evals/run_campus_priority_fixture_eval.py"])
        run(["uv", "run", "python", "evals/run_open_survey_fixture_eval.py"])
        run(["uv", "run", "python", "evals/run_startup_item_validation_fixture_eval.py"])
        pytest_command = [
            "uv",
            "run",
            "pytest",
            *PYTEST_COV_TARGETS,
            "--cov-report=term-missing",
            "--cov-fail-under=85",
            "tests",
        ]
        if args.skip_dataset_tests:
            pytest_command += ["-m", "not requires_dataset"]
        run(pytest_command)
        run(["npm", "run", "lint"], cwd=FRONTEND_DIR)
        run(["npm", "run", "typecheck"], cwd=FRONTEND_DIR)
        if not args.skip_build:
            run(["npm", "run", "build"], cwd=FRONTEND_DIR)
            if not args.skip_e2e:
                # Real-browser booth journey (fake LLM, inline worker) — closes
                # the UI->planner->backend seam the fixture checks cannot see.
                run(["npx", "playwright", "test"], cwd=FRONTEND_DIR)
    except subprocess.CalledProcessError as exc:
        return exc.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
