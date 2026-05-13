"""Provider-agnostic LLM client contracts."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

LLMRole = Literal["system", "user", "assistant", "tool"]


@dataclass(frozen=True)
class LLMMessage:
    role: LLMRole
    content: str


@dataclass(frozen=True)
class LLMRequest:
    task_type: str
    messages: list[LLMMessage]
    model_alias: str | None = None
    temperature: float = 0.7
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMResponse:
    content: str
    provider: str
    provider_model: str
    trace_id: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)


class LLMClientProtocol(Protocol):
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate a response for a provider-agnostic request."""
