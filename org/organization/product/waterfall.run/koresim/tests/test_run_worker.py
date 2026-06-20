from types import SimpleNamespace

from rq.utils import import_attribute

from scripts.run_worker import handle_failed_job
from src.jobs.models import RunStatusValue


def test_rq_can_import_worker_callable_by_dotted_path() -> None:
    imported = import_attribute("src.jobs.worker.run_simulation_job")

    assert imported.__name__ == "run_simulation_job"


def test_handle_failed_job_does_not_overwrite_existing_failed_error(monkeypatch) -> None:
    class FakeStore:
        updates = []
        events = []

        def get_run(self, run_id):
            assert run_id == "run-1"
            return SimpleNamespace(status=RunStatusValue.FAILED)

        def update_run_status(self, *args, **kwargs):
            self.updates.append((args, kwargs))

        def append_event(self, *args, **kwargs):
            self.events.append((args, kwargs))

    monkeypatch.setattr("src.jobs.store.SQLiteRunStore", FakeStore)

    handled = handle_failed_job(
        SimpleNamespace(args=("run-1",), id="job-1"),
        ValueError,
        ValueError("original domain error"),
        None,
    )

    assert handled is True
    assert FakeStore.updates == []
    assert FakeStore.events == []
