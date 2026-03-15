import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..services.llm import (
    check_ollama_status, check_groq_status,
    get_active_provider, set_active_provider,
)
from ..services import profile as profile_svc
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


@router.get("/my-profile")
def get_my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the current user's personality profile."""
    p = profile_svc.get_or_create(user.id, db)
    topics = json.loads(p.study_topics or "[]")
    return {
        "name": user.display_name or user.email.split("@")[0],
        "email": user.email,
        "study_topics": topics,
        "preferred_language": p.preferred_language,
        "total_messages": p.total_messages or 0,
        "total_study_sessions": p.total_study_sessions or 0,
        "last_topic_summary": p.last_topic_summary or "",
        "last_seen": p.last_seen.isoformat() if p.last_seen else None,
    }


class UpdateProfileRequest(BaseModel):
    display_name: str = None
    preferred_language: str = None


@router.patch("/my-profile")
def update_my_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let the user update their display name and language preference."""
    if req.display_name is not None:
        user.display_name = req.display_name.strip()[:80]
        db.commit()
    if req.preferred_language in ("english", "urdu", "mixed"):
        p = profile_svc.get_or_create(user.id, db)
        p.preferred_language = req.preferred_language
        db.commit()
    return {"ok": True}
