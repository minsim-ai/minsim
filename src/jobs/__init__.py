"""Internal job lifecycle package.

Gate 1A only defines internal models. Persistence and workers are added later.
"""
from __future__ import annotations

from importlib import import_module
from types import ModuleType


def __getattr__(name: str) -> ModuleType:
    if name == "worker":
        return import_module("src.jobs.worker")
    raise AttributeError(name)
