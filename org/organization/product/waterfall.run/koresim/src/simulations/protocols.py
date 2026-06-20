"""Declarative simulation protocol contracts."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


ProtocolStepMode = Literal[
    "singleton",
    "multi_turn",
    "follow_up",
    "forced_choice",
    "ranking",
    "objection_probe",
    "anchor_probe",
]


@dataclass(frozen=True)
class ProtocolStep:
    id: str
    mode: ProtocolStepMode
    task_type: str
    model_alias: str | None = None
    condition: str | None = None
    output_schema: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProtocolSpec:
    protocol_id: str
    steps: list[ProtocolStep]
    schema_version: str = "simulation-protocol/v1"

    def validate(self) -> None:
        if not self.protocol_id:
            raise ValueError("protocol_id is required")
        if not self.steps:
            raise ValueError("protocol must contain at least one step")
        seen: set[str] = set()
        for step in self.steps:
            if not step.id:
                raise ValueError("protocol step id is required")
            if step.id in seen:
                raise ValueError(f"duplicate protocol step id: {step.id}")
            if not step.task_type:
                raise ValueError(f"protocol step {step.id} requires task_type")
            seen.add(step.id)

    def model_dump(self) -> dict[str, Any]:
        self.validate()
        return {
            "schema_version": self.schema_version,
            "protocol_id": self.protocol_id,
            "steps": [
                {
                    "id": step.id,
                    "mode": step.mode,
                    "task_type": step.task_type,
                    "model_alias": step.model_alias,
                    "condition": step.condition,
                    "output_schema": step.output_schema,
                }
                for step in self.steps
            ],
        }
