"""환경설정 — .env에서 로드"""
import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

CONCURRENCY = int(os.getenv("CONCURRENCY", "8"))
MAX_SAMPLE_SIZE = int(os.getenv("MAX_SAMPLE_SIZE", "200"))
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
LLM_RETRY_ATTEMPTS = int(os.getenv("LLM_RETRY_ATTEMPTS", "1"))
PARQUET_PATH = Path(
    os.getenv("PARQUET_PATH", str(PROJECT_ROOT / "data" / "nemotron_korea_personas.parquet"))
)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RUNTIME_DATA_DIR = Path(os.getenv("RUNTIME_DATA_DIR", str(PROJECT_ROOT / "data" / "runtime")))
SQLITE_PATH = Path(os.getenv("SQLITE_PATH", str(RUNTIME_DATA_DIR / "koresim.sqlite3")))
ENABLE_LANGGRAPH = os.getenv("ENABLE_LANGGRAPH", "false").lower() == "true"
ENABLE_LLM_AGENTS = os.getenv("ENABLE_LLM_AGENTS", "true").lower() == "true"
LLM_BACKEND = os.getenv("LLM_BACKEND", "gemini")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

MODEL_PERSONA_DEFAULT = os.getenv("MODEL_PERSONA_DEFAULT", GEMINI_MODEL)
MODEL_PERSONA_STRONG = os.getenv("MODEL_PERSONA_STRONG", MODEL_PERSONA_DEFAULT)
MODEL_ANALYSIS_DEFAULT = os.getenv("MODEL_ANALYSIS_DEFAULT", MODEL_PERSONA_DEFAULT)
MODEL_REPORT_DEFAULT = os.getenv("MODEL_REPORT_DEFAULT", MODEL_PERSONA_DEFAULT)
MODEL_REPAIR_DEFAULT = os.getenv("MODEL_REPAIR_DEFAULT", MODEL_PERSONA_DEFAULT)

LLM_GATEWAY_BASE_URL = os.getenv("LLM_GATEWAY_BASE_URL", "http://127.0.0.1:4000/v1")
LLM_GATEWAY_API_KEY = os.getenv("LLM_GATEWAY_API_KEY", "")

UPSTAGE_API_KEY = os.getenv("UPSTAGE_API_KEY", "")
UPSTAGE_BASE_URL = os.getenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1")
UPSTAGE_MODEL = os.getenv("UPSTAGE_MODEL", "solar-pro2")

OBSERVABILITY_PROVIDER = os.getenv("OBSERVABILITY_PROVIDER", "none")
LLM_TRACE_MODE = os.getenv("LLM_TRACE_MODE", "metadata_only")
LANGFUSE_BASE_URL = os.getenv(
    "LANGFUSE_BASE_URL",
    os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)
