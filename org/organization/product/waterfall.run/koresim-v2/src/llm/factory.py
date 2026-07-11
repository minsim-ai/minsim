"""LLM client factory."""
from __future__ import annotations

from src.config import (
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_MODEL,
    LLM_BACKEND,
    LLM_GATEWAY_API_KEY,
    LLM_GATEWAY_BASE_URL,
    MODEL_PERSONA_DEFAULT,
    UPSTAGE_API_KEY,
    UPSTAGE_BASE_URL,
    UPSTAGE_MODEL,
)
from src.llm.base import LLMClientProtocol
from src.llm.fake import FakeLLMClient
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter
from src.llm.tracing import with_tracing


def create_llm_client() -> LLMClientProtocol:
    if LLM_BACKEND == "fake":
        return with_tracing(FakeLLMClient())
    if LLM_BACKEND == "upstage":
        return with_tracing(
            OpenAICompatibleAdapter(
                provider="upstage",
                model=UPSTAGE_MODEL,
                base_url=UPSTAGE_BASE_URL,
                api_key=UPSTAGE_API_KEY,
            )
        )
    if LLM_BACKEND == "litellm":
        return with_tracing(
            OpenAICompatibleAdapter(
                provider="litellm",
                model=MODEL_PERSONA_DEFAULT,
                base_url=LLM_GATEWAY_BASE_URL,
                api_key=LLM_GATEWAY_API_KEY or "koresim-local",
                use_request_model_alias=True,
            )
        )
    return with_tracing(
        OpenAICompatibleAdapter(
            provider="gemini",
            model=GEMINI_MODEL,
            base_url=GEMINI_BASE_URL,
            api_key=GEMINI_API_KEY,
        )
    )
