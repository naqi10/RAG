from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user
from ..models import User
from ..services.llm import (
    check_ollama_status, check_groq_status,
    get_active_provider, set_active_provider,
)
from ..utils.config import OLLAMA_BASE_URL, OLLAMA_MODEL

router = APIRouter()


class SwitchLLMRequest(BaseModel):
    provider: str


@router.get("/status")
def llm_status(user: User = Depends(get_current_user)):
    """Return current LLM provider status and available models."""
    provider = get_active_provider()
    result = {"provider": provider}
    if provider == "ollama":
        result["ollama"] = check_ollama_status()
    elif provider == "groq":
        result["groq"] = check_groq_status()
    else:
        result["ollama"] = {"status": "not_configured"}
    return result


@router.get("/config")
def get_config(user: User = Depends(get_current_user)):
    """Return non-sensitive configuration."""
    return {
        "llm_provider": get_active_provider(),
        "ollama_model": OLLAMA_MODEL,
        "ollama_base_url": OLLAMA_BASE_URL,
    }


@router.post("/switch-llm")
def switch_llm(req: SwitchLLMRequest, user: User = Depends(get_current_user)):
    """Switch LLM provider at runtime (no restart needed)."""
    valid = ["ollama", "groq", "openai"]
    if req.provider.lower() not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid provider. Use: {valid}")
    set_active_provider(req.provider)
    return {"provider": get_active_provider(), "message": f"Switched to {req.provider}"}


@router.get("/providers-status")
def providers_status(user: User = Depends(get_current_user)):
    """Check connectivity for all LLM providers."""
    return {
        "active_provider": get_active_provider(),
        "ollama": check_ollama_status(),
        "groq": check_groq_status(),
    }
