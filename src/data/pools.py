"""Selectable persona pools (B-3).

Every pool is a Nemotron-field-compatible parquet file. A pool with a missing
file is registered but reported unavailable so the UI can ship before the
dataset lands (e.g. the DGIST 2,000-persona update).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from src.config import DGIST_PARQUET_PATH, PARQUET_PATH

DEFAULT_PERSONA_POOL = "nationwide"


@dataclass(frozen=True)
class PersonaPoolSpec:
    pool_id: str
    label: str
    path: Path
    description: str
    source: str


PERSONA_POOLS: dict[str, PersonaPoolSpec] = {
    "nationwide": PersonaPoolSpec(
        pool_id="nationwide",
        label="전 국민",
        path=PARQUET_PATH,
        description="NVIDIA Nemotron-Personas-Korea 기반 전국 합성 페르소나",
        source="nvidia/Nemotron-Personas-Korea",
    ),
    "dgist": PersonaPoolSpec(
        pool_id="dgist",
        label="DGIST 구성원",
        path=DGIST_PARQUET_PATH,
        description="DGIST 구성원 페르소나 (Nemotron 필드 호환)",
        source="https://github.com/Jaeyeong-CHOI/dgist-personas",
    ),
}


def resolve_pool(pool_id: str | None) -> PersonaPoolSpec:
    key = (pool_id or DEFAULT_PERSONA_POOL).strip().lower()
    spec = PERSONA_POOLS.get(key)
    if spec is None:
        allowed = ", ".join(sorted(PERSONA_POOLS))
        raise ValueError(f"Unknown persona pool: {pool_id!r}. Allowed: {allowed}.")
    return spec


def pool_metadata() -> list[dict[str, object]]:
    return [
        {
            "id": spec.pool_id,
            "label": spec.label,
            "description": spec.description,
            "available": spec.path.exists(),
        }
        for spec in PERSONA_POOLS.values()
    ]
