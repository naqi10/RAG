from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..services.analytics import (
    get_user_stats,
    get_workspace_stats,
    get_study_progress,
    get_document_insights,
    get_quiz_topic_performance,
)
from ..database import get_db
from ..models import User
from ..auth import get_current_user

router = APIRouter()


@router.get("/overview")
def overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_stats(user.id, db)


@router.get("/workspace/{ws_id}")
def workspace_stats(
    ws_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_workspace_stats(ws_id, user.id, db)


@router.get("/progress")
def study_progress(
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_study_progress(user.id, db, days)


@router.get("/document-insights/{ws_id}")
def document_insights(
    ws_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_document_insights(ws_id, user.id, db)


@router.get("/quiz-topics/{ws_id}")
def quiz_topics(
    ws_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_quiz_topic_performance(ws_id, user.id, db)
