import os
import threading
from pathlib import Path
from dotenv import load_dotenv
from ..utils.logger import logger

# Load .env from backend/.env
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_ROOT / ".env")

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None

try:
    from langchain_ollama import ChatOllama
except ImportError:
    ChatOllama = None

# ── Runtime provider state ──
_active_provider = None
_provider_lock = threading.Lock()


def set_active_provider(provider: str):
    """Switch LLM provider at runtime without restart."""
    global _active_provider
    with _provider_lock:
        _active_provider = provider.lower()
    logger.info(f"LLM provider switched to: {provider}")


def get_active_provider() -> str:
    """Get current active LLM provider."""
    with _provider_lock:
        return _active_provider or os.getenv("LLM_PROVIDER", "ollama").lower()


def get_llm(model: str = None, temperature: float = 0.0):
    """
    Returns a langchain-compatible chat LLM.
    Uses runtime provider or LLM_PROVIDER env var:
      - 'ollama': local Ollama server (offline)
      - 'groq': Groq cloud API
      - 'openai': OpenAI cloud API
    """
    provider = get_active_provider()

    if provider == "ollama":
        if ChatOllama is None:
            raise RuntimeError("langchain-ollama is not installed. Run: pip install langchain-ollama")
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        ollama_model = model or os.getenv("OLLAMA_MODEL", "llama3.1:8b")
        logger.info(f"Using Ollama Chat model ({ollama_model}) at {base_url}")
        return ChatOllama(
            base_url=base_url,
            model=ollama_model,
            temperature=temperature,
            timeout=120,
        )

    elif provider == "groq":
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key or not ChatGroq:
            raise RuntimeError("GROQ_API_KEY not set or langchain-groq not installed.")
        groq_model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        logger.info(f"Using Groq Chat model ({groq_model})")
        return ChatGroq(
            groq_api_key=groq_key,
            model=groq_model,
            temperature=temperature,
            request_timeout=180,
        )

    elif provider == "openai":
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key or not ChatOpenAI:
            raise RuntimeError("OPENAI_API_KEY not set or langchain-openai not installed.")
        openai_model = model or "gpt-4o-mini"
        logger.info(f"Using OpenAI Chat model ({openai_model})")
        return ChatOpenAI(
            api_key=openai_key,
            model=openai_model,
            temperature=temperature,
        )

    else:
        raise RuntimeError(
            f"Unknown LLM_PROVIDER: '{provider}'. Use 'ollama', 'groq', or 'openai'."
        )


def get_llm_with_fallback(model: str = None, temperature: float = 0.0):
    """Try primary provider, auto-fallback to secondary on failure."""
    primary = get_active_provider()
    fallback_map = {"groq": "ollama", "ollama": "groq", "openai": "ollama"}

    try:
        return get_llm(model, temperature)
    except Exception as e:
        fallback = fallback_map.get(primary)
        if not fallback:
            raise
        logger.warning(f"Primary provider '{primary}' failed: {e}. Falling back to '{fallback}'...")
        original = get_active_provider()
        try:
            set_active_provider(fallback)
            llm = get_llm(model, temperature)
            # Restore original so user's preference is preserved
            set_active_provider(original)
            return llm
        except Exception as e2:
            set_active_provider(original)
            raise RuntimeError(f"Both '{primary}' and '{fallback}' failed") from e2


def check_ollama_status() -> dict:
    """Check if Ollama is running and which models are available."""
    import httpx
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        resp = httpx.get(f"{base_url}/api/tags", timeout=5)
        resp.raise_for_status()
        models = [m["name"] for m in resp.json().get("models", [])]
        return {"status": "connected", "base_url": base_url, "models": models}
    except Exception as e:
        return {"status": "disconnected", "base_url": base_url, "error": str(e), "models": []}


def check_groq_status() -> dict:
    """Check if Groq API is reachable."""
    import httpx
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return {"status": "not_configured", "error": "GROQ_API_KEY not set"}
    try:
        resp = httpx.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {groq_key}"},
            timeout=10,
        )
        resp.raise_for_status()
        models = [m["id"] for m in resp.json().get("data", [])]
        return {"status": "connected", "models": models[:5]}
    except Exception as e:
        return {"status": "disconnected", "error": str(e), "models": []}
