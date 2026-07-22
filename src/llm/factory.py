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
    MONO_API_KEY,
    MONO_BASE_URL,
    MONO_MODEL,
    SUPPORTED_LLM_BACKENDS,
    UPSTAGE_API_KEYS,
    UPSTAGE_BASE_URL,
    UPSTAGE_MODEL,
)
from src.llm.base import LLMClientProtocol
from src.llm.fake import FakeLLMClient
from src.llm.openai_compatible_adapter import OpenAICompatibleAdapter
from src.llm.round_robin_adapter import RoundRobinAdapter
from src.llm.tracing import with_tracing


def create_llm_client() -> LLMClientProtocol:
    if LLM_BACKEND not in SUPPORTED_LLM_BACKENDS:
        supported = ", ".join(sorted(SUPPORTED_LLM_BACKENDS))
        raise RuntimeError(f"Unsupported LLM_BACKEND={LLM_BACKEND!r}. Supported values: {supported}.")
    if LLM_BACKEND == "fake":
        return with_tracing(FakeLLMClient())
    if LLM_BACKEND == "upstage":
        if not UPSTAGE_API_KEYS:
            raise RuntimeError("Upstage API key is not configured.")
        adapters = [
            OpenAICompatibleAdapter(
                provider="upstage",
                model=UPSTAGE_MODEL,
                base_url=UPSTAGE_BASE_URL,
                api_key=key,
            )
            for key in UPSTAGE_API_KEYS
        ]
        if len(adapters) == 1:
            return with_tracing(adapters[0])
        return with_tracing(RoundRobinAdapter(adapters))
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
    if LLM_BACKEND == "gemini":
        return with_tracing(
            OpenAICompatibleAdapter(
                provider="gemini",
                model=GEMINI_MODEL,
                base_url=GEMINI_BASE_URL,
                api_key=GEMINI_API_KEY,
            )
        )
    if LLM_BACKEND in {"mono", "openai"}:
        provider = "openai" if LLM_BACKEND == "openai" else "mono"
        return with_tracing(
            OpenAICompatibleAdapter(
                provider=provider,
                model=MONO_MODEL,
                base_url=MONO_BASE_URL,
                api_key=MONO_API_KEY,
                use_request_model_alias=True,
            )
        )
    raise AssertionError(f"Unhandled LLM backend: {LLM_BACKEND}")
