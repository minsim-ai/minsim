"""환경설정 — .env에서 로드"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

CONCURRENCY = int(os.getenv("CONCURRENCY", "64"))
MAX_SAMPLE_SIZE = int(os.getenv("MAX_SAMPLE_SIZE", "2000"))
# Event-day booth mode: smaller default panels, queue admission, higher free runs.
KORESIM_EVENT_MODE = os.getenv("KORESIM_EVENT_MODE", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except ValueError:
        return default


EVENT_DEFAULT_SAMPLE_SIZE = max(1, _env_int("EVENT_DEFAULT_SAMPLE_SIZE", 100))
EVENT_MAX_SAMPLE_SIZE = max(
    EVENT_DEFAULT_SAMPLE_SIZE, _env_int("EVENT_MAX_SAMPLE_SIZE", 300)
)
EVENT_MAX_QUEUED_RUNS = max(1, _env_int("EVENT_MAX_QUEUED_RUNS", 40))
# 0 = unlimited free runs for every authenticated account.
KORESIM_FREE_RUN_LIMIT = max(0, _env_int("KORESIM_FREE_RUN_LIMIT", 0))
LLM_MAX_CONNECTIONS = int(os.getenv("LLM_MAX_CONNECTIONS", "256"))
# Global provider request budget per minute across the whole fleet when
# LLM_RPM_LIMITER=redis. 0 disables shaping. Upstage single-process ~400-500;
# OpenAI multi-worker target is higher (see openai multi-worker plan).
LLM_MAX_RPM = int(os.getenv("LLM_MAX_RPM", "0"))
# redis = shared sliding window (required for multi-worker). local = process only.
# auto = redis when WORKER_COUNT>1 else local.
LLM_RPM_LIMITER = os.getenv("LLM_RPM_LIMITER", "auto").strip().lower()
LLM_RPM_REDIS_KEY = os.getenv("LLM_RPM_REDIS_KEY", "koresim:llm:rpm")
WORKER_COUNT = max(1, int(os.getenv("WORKER_COUNT", "1")))
# Multi-worker must not mark sibling workers' runs interrupted on every boot.
_INTERRUPT_RAW = os.getenv("INTERRUPT_ACTIVE_RUNS_ON_STARTUP", "").strip().lower()
if _INTERRUPT_RAW in {"1", "true", "yes", "on"}:
    INTERRUPT_ACTIVE_RUNS_ON_STARTUP = True
elif _INTERRUPT_RAW in {"0", "false", "no", "off"}:
    INTERRUPT_ACTIVE_RUNS_ON_STARTUP = False
else:
    INTERRUPT_ACTIVE_RUNS_ON_STARTUP = WORKER_COUNT <= 1
LLM_SDK_MAX_RETRIES = int(os.getenv("LLM_SDK_MAX_RETRIES", "0"))
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
LLM_RETRY_ATTEMPTS = int(os.getenv("LLM_RETRY_ATTEMPTS", "2"))
LLM_RETRY_BACKOFF_SECONDS = float(os.getenv("LLM_RETRY_BACKOFF_SECONDS", "1"))
LLM_RETRY_MAX_BACKOFF_SECONDS = float(os.getenv("LLM_RETRY_MAX_BACKOFF_SECONDS", "30"))
PARQUET_PATH = Path(
    os.getenv("PARQUET_PATH", str(PROJECT_ROOT / "data" / "nemotron_korea_personas.parquet"))
)
DGIST_PARQUET_PATH = Path(
    os.getenv("DGIST_PARQUET_PATH", str(PROJECT_ROOT / "data" / "dgist_personas.parquet"))
)

MODEL_PRICE_TABLE_PATH = Path(
    os.getenv("MODEL_PRICE_TABLE_PATH", str(PROJECT_ROOT / "config" / "model_prices.json"))
)

PERSONAS_DATA_DIR = Path(
    os.getenv("PERSONAS_DATA_DIR", str(PROJECT_ROOT / "data" / "personas"))
)
DEFAULT_COUNTRY_ID = os.getenv("DEFAULT_COUNTRY_ID", "kr").strip().lower()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RUNTIME_DATA_DIR = Path(os.getenv("RUNTIME_DATA_DIR", str(PROJECT_ROOT / "data" / "runtime")))
SQLITE_PATH = Path(os.getenv("SQLITE_PATH", str(RUNTIME_DATA_DIR / "koresim.sqlite3")))
ENABLE_LANGGRAPH = os.getenv("ENABLE_LANGGRAPH", "true").lower() == "true"
ENABLE_LLM_AGENTS = os.getenv("ENABLE_LLM_AGENTS", "true").lower() == "true"
# "openai" is a readable alias for the OpenAI-compatible "mono" backend.
SUPPORTED_LLM_BACKENDS = frozenset({"fake", "gemini", "litellm", "upstage", "mono", "openai"})
LLM_BACKEND = os.getenv("LLM_BACKEND", "upstage").strip().lower()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

UPSTAGE_API_KEY = os.getenv("UPSTAGE_API_KEY", "")
# Explicit per-key variables for round-robin throughput.
# Collect all non-empty keys from UPSTAGE_API_KEY_1, UPSTAGE_API_KEY_2, …,
# falling back to the single UPSTAGE_API_KEY when none is set.
UPSTAGE_API_KEY_1 = os.getenv("UPSTAGE_API_KEY_1", "")
UPSTAGE_API_KEY_2 = os.getenv("UPSTAGE_API_KEY_2", "")


def _collect_upstage_api_keys() -> list[str]:
    """Return list of Upstage API keys to use for round-robin.

    Preference order: UPSTAGE_API_KEY_1, UPSTAGE_API_KEY_2, … (all non-empty),
    then UPSTAGE_API_KEY (single-key backward compat).
    """
    keys = [k for k in (UPSTAGE_API_KEY_1, UPSTAGE_API_KEY_2) if k]
    if not keys and UPSTAGE_API_KEY:
        keys = [UPSTAGE_API_KEY]
    return keys


UPSTAGE_API_KEYS: list[str] = _collect_upstage_api_keys()
UPSTAGE_BASE_URL = os.getenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1")
UPSTAGE_MODEL = os.getenv("UPSTAGE_MODEL", "solar-pro2")

# OpenAI-compatible GPT backend ("mono" legacy name; "openai" alias also accepted).
# Prefer MONO_* vars; OPENAI_* is a friendly fallback for a single ChatGPT API key.
MONO_API_KEY = os.getenv("MONO_API_KEY") or os.getenv("OPENAI_API_KEY", "")
MONO_BASE_URL = (
    os.getenv("MONO_BASE_URL")
    or os.getenv("OPENAI_BASE_URL")
    or "https://api.openai.com/v1"
)
MONO_MODEL = os.getenv("MONO_MODEL") or os.getenv("OPENAI_MODEL", "gpt-5.4-nano")


def _parse_agent_extra_body(raw: str) -> dict:
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


# Optional reasoning/"thinking" params forwarded only on analysis/report/qa
# calls, e.g. {"reasoning_effort": "medium"}. Empty by default.
AGENT_EXTRA_BODY = _parse_agent_extra_body(os.getenv("MODEL_AGENT_EXTRA_BODY_JSON", ""))

# Web search enrichment for project autofill (C-4, Serper.dev).
# "auto" activates as soon as SERPER_API_KEY exists; "true"/"false" force it.
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")
_WEB_SEARCH_RAW = os.getenv("WEB_SEARCH_ENABLED", "auto").strip().lower()
WEB_SEARCH_ENABLED = _WEB_SEARCH_RAW == "true" or (
    _WEB_SEARCH_RAW == "auto" and bool(SERPER_API_KEY)
)

_DEFAULT_MODEL_ALIASES = {
    "upstage": {
        "persona": UPSTAGE_MODEL,
        "analysis": UPSTAGE_MODEL,
        "report": UPSTAGE_MODEL,
        "repair": UPSTAGE_MODEL,
    },
    "litellm": {
        "persona": "koresim/solar-persona",
        "analysis": "koresim/solar-analysis",
        "report": "koresim/solar-report",
        "repair": "koresim/solar-repair",
    },
    "gemini": {
        "persona": GEMINI_MODEL,
        "analysis": GEMINI_MODEL,
        "report": GEMINI_MODEL,
        "repair": GEMINI_MODEL,
    },
    "fake": {
        "persona": "koresim-fake-v1",
        "analysis": "koresim-fake-v1",
        "report": "koresim-fake-v1",
        "repair": "koresim-fake-v1",
    },
    "mono": {
        "persona": MONO_MODEL,
        "analysis": MONO_MODEL,
        "report": MONO_MODEL,
        "repair": MONO_MODEL,
    },
    "openai": {
        "persona": MONO_MODEL,
        "analysis": MONO_MODEL,
        "report": MONO_MODEL,
        "repair": MONO_MODEL,
    },
}.get(LLM_BACKEND, {})

MODEL_PERSONA_DEFAULT = os.getenv(
    "MODEL_PERSONA_DEFAULT", _DEFAULT_MODEL_ALIASES.get("persona", UPSTAGE_MODEL)
)
MODEL_PERSONA_STRONG = os.getenv("MODEL_PERSONA_STRONG", MODEL_PERSONA_DEFAULT)
MODEL_ANALYSIS_DEFAULT = os.getenv(
    "MODEL_ANALYSIS_DEFAULT", _DEFAULT_MODEL_ALIASES.get("analysis", MODEL_PERSONA_DEFAULT)
)
MODEL_REPORT_DEFAULT = os.getenv(
    "MODEL_REPORT_DEFAULT", _DEFAULT_MODEL_ALIASES.get("report", MODEL_PERSONA_DEFAULT)
)
MODEL_REPAIR_DEFAULT = os.getenv(
    "MODEL_REPAIR_DEFAULT", _DEFAULT_MODEL_ALIASES.get("repair", MODEL_PERSONA_DEFAULT)
)
ALLOWED_MODEL_ALIASES = frozenset(
    {
        MODEL_PERSONA_DEFAULT,
        MODEL_PERSONA_STRONG,
        MODEL_ANALYSIS_DEFAULT,
        MODEL_REPORT_DEFAULT,
        MODEL_REPAIR_DEFAULT,
    }
)

LLM_GATEWAY_BASE_URL = os.getenv("LLM_GATEWAY_BASE_URL", "http://127.0.0.1:4000/v1")
LLM_GATEWAY_API_KEY = os.getenv("LLM_GATEWAY_API_KEY", "")

INTERACTIVE_LLM_ACTIONS_PER_HOUR = int(os.getenv("INTERACTIVE_LLM_ACTIONS_PER_HOUR", "20"))
INTERACTIVE_FOLLOWUP_MAX_SAMPLE_SIZE = int(
    os.getenv("INTERACTIVE_FOLLOWUP_MAX_SAMPLE_SIZE", "12")
)

OBSERVABILITY_PROVIDER = os.getenv("OBSERVABILITY_PROVIDER", "none")
LLM_TRACE_MODE = os.getenv("LLM_TRACE_MODE", "metadata_only")
LANGFUSE_BASE_URL = os.getenv(
    "LANGFUSE_BASE_URL",
    os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)
