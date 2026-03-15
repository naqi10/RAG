import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import (
    User, Workspace, WorkspacePDF, Conversation, Message,
    Quiz, StudySession, Note,
)


def _build_stats(
    db: Session,
    workspace_filter_query,
    conversation_filter_query,
    quiz_filter_query,
    note_filter_query,
    session_filter_query,
):
    workspace_clause = workspace_filter_query.whereclause
    conversation_clause = conversation_filter_query.whereclause

    total_workspaces = workspace_filter_query.count()
    pdf_query = db.query(WorkspacePDF).join(Workspace)
    if workspace_clause is not None:
        pdf_query = pdf_query.filter(workspace_clause)
    total_pdfs = pdf_query.count()
    total_conversations = conversation_filter_query.count()
    message_query = db.query(Message).join(Conversation)
    if conversation_clause is not None:
        message_query = message_query.filter(conversation_clause)
    total_messages = message_query.count()

    quizzes = quiz_filter_query.all()
    completed_quizzes = [q for q in quizzes if q.status == "completed" and q.score is not None]
    avg_score = (
        round(sum(q.score for q in completed_quizzes) / len(completed_quizzes))
        if completed_quizzes
        else 0
    )
    total_notes = note_filter_query.count()

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    sessions = session_filter_query.filter(StudySession.created_at >= thirty_days_ago).all()
    active_days = {s.created_at.date() for s in sessions if s.created_at}

    recent_message_query = db.query(Message).join(Conversation).filter(Message.created_at >= thirty_days_ago)
    if conversation_clause is not None:
        recent_message_query = recent_message_query.filter(conversation_clause)
    recent_messages = recent_message_query.all()
    active_days.update({m.created_at.date() for m in recent_messages if m.created_at})

    streak = 0
    today = datetime.utcnow().date()
    for i in range(30):
        day = today - timedelta(days=i)
        if day in active_days:
            streak += 1
        elif i > 0:
            break

    return {
        "total_workspaces": total_workspaces,
        "total_pdfs": total_pdfs,
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "total_quizzes": len(quizzes),
        "completed_quizzes": len(completed_quizzes),
        "average_quiz_score": avg_score,
        "total_notes": total_notes,
        "study_streak_days": streak,
    }


def get_user_stats(user_id: str, db: Session) -> dict:
    """Overall user statistics."""
    return _build_stats(
        db=db,
        workspace_filter_query=db.query(Workspace).filter(Workspace.user_id == user_id),
        conversation_filter_query=db.query(Conversation).filter(Conversation.user_id == user_id),
        quiz_filter_query=db.query(Quiz).filter(Quiz.user_id == user_id),
        note_filter_query=db.query(Note).filter(Note.user_id == user_id),
        session_filter_query=db.query(StudySession).filter(StudySession.user_id == user_id),
    )


def get_admin_stats(db: Session) -> dict:
    """Global analytics for admin dashboard across all users."""
    stats = _build_stats(
        db=db,
        workspace_filter_query=db.query(Workspace),
        conversation_filter_query=db.query(Conversation),
        quiz_filter_query=db.query(Quiz),
        note_filter_query=db.query(Note),
        session_filter_query=db.query(StudySession),
    )
    stats["total_users"] = db.query(User).filter(User.role != "admin").count()
    return stats


def get_workspace_stats(workspace_id: str, user_id: str, db: Session) -> dict:
    """Per-workspace statistics."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id, Workspace.user_id == user_id
    ).first()
    if not ws:
        return {}

    pdfs = db.query(WorkspacePDF).filter(WorkspacePDF.workspace_id == workspace_id).all()
    total_chunks = sum(p.chunks_count or 0 for p in pdfs)
    total_pages = sum(p.pages or 0 for p in pdfs)

    conversations = db.query(Conversation).filter(
        Conversation.workspace_id == workspace_id
    ).all()
    convo_ids = [c.id for c in conversations]

    message_count = 0
    if convo_ids:
        message_count = (
            db.query(Message)
            .filter(Message.conversation_id.in_(convo_ids))
            .count()
        )

    # Quiz stats for this workspace
    quizzes = db.query(Quiz).filter(
        Quiz.workspace_id == workspace_id, Quiz.user_id == user_id
    ).all()
    completed = [q for q in quizzes if q.status == "completed"]
    avg_score = (
        round(sum(q.score for q in completed) / len(completed)) if completed else 0
    )
    best_score = max((q.score for q in completed), default=0)

    note_count = db.query(Note).filter(
        Note.workspace_id == workspace_id, Note.user_id == user_id
    ).count()

    # Recent activity
    recent_convos = sorted(conversations, key=lambda c: c.updated_at or c.created_at, reverse=True)[:5]
    recent_activity = [
        {
            "type": "conversation",
            "title": c.title,
            "timestamp": (c.updated_at or c.created_at).isoformat() if (c.updated_at or c.created_at) else None,
        }
        for c in recent_convos
    ]

    return {
        "workspace_title": ws.title,
        "pdf_count": len(pdfs),
        "total_chunks": total_chunks,
        "total_pages": total_pages,
        "conversation_count": len(conversations),
        "message_count": message_count,
        "quiz_stats": {
            "taken": len(quizzes),
            "completed": len(completed),
            "average_score": avg_score,
            "best_score": best_score,
        },
        "note_count": note_count,
        "recent_activity": recent_activity,
    }


def get_study_progress(user_id: str, db: Session, days: int = 30) -> list:
    """Daily study activity for charts."""
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get all sessions
    sessions = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id, StudySession.created_at >= start_date)
        .all()
    )

    # Get all messages
    messages = (
        db.query(Message)
        .join(Conversation)
        .filter(Conversation.user_id == user_id, Message.created_at >= start_date)
        .all()
    )

    # Build daily stats
    daily = {}
    for i in range(days):
        day = (datetime.utcnow() - timedelta(days=i)).date()
        daily[day.isoformat()] = {"date": day.isoformat(), "messages": 0, "quizzes": 0, "sessions": 0, "minutes": 0}

    for m in messages:
        if m.created_at:
            key = m.created_at.date().isoformat()
            if key in daily:
                daily[key]["messages"] += 1

    for s in sessions:
        if s.created_at:
            key = s.created_at.date().isoformat()
            if key in daily:
                daily[key]["sessions"] += 1
                daily[key]["minutes"] += (s.duration_seconds or 0) // 60
                if s.session_type == "quiz":
                    daily[key]["quizzes"] += 1

    return sorted(daily.values(), key=lambda x: x["date"])


def get_quiz_topic_performance(workspace_id: str, user_id: str, db: Session) -> dict:
    """Aggregate quiz scores per source/topic for heatmap display."""
    quizzes = (
        db.query(Quiz)
        .filter(
            Quiz.workspace_id == workspace_id,
            Quiz.user_id == user_id,
            Quiz.status == "completed",
        )
        .all()
    )

    if not quizzes:
        return {"topics": [], "summary": {"total_quizzes": 0, "overall_accuracy": 0}}

    # Aggregate per-source/topic performance
    topic_stats = {}  # {source_name: {correct: 0, total: 0, difficulties: []}}

    for quiz in quizzes:
        try:
            questions = json.loads(quiz.questions_json) if quiz.questions_json else []
            answers = json.loads(quiz.answers_json) if quiz.answers_json else []
        except (json.JSONDecodeError, TypeError):
            continue

        answer_map = {a.get("question_index", i): a for i, a in enumerate(answers)}

        for i, q in enumerate(questions):
            source = q.get("source", {})
            source_name = source.get("source", "Unknown") if isinstance(source, dict) else str(source)
            # Clean up source name (remove path, keep filename)
            if "/" in source_name:
                source_name = source_name.rsplit("/", 1)[-1]
            if "\\" in source_name:
                source_name = source_name.rsplit("\\", 1)[-1]

            if source_name not in topic_stats:
                topic_stats[source_name] = {"correct": 0, "total": 0, "difficulties": []}

            topic_stats[source_name]["total"] += 1
            topic_stats[source_name]["difficulties"].append(q.get("difficulty", "medium"))

            ans = answer_map.get(i, {})
            if ans.get("correct", False):
                topic_stats[source_name]["correct"] += 1

    # Build topics list with accuracy percentage
    topics = []
    total_correct = 0
    total_questions = 0
    for source_name, stats in topic_stats.items():
        accuracy = round((stats["correct"] / stats["total"]) * 100) if stats["total"] > 0 else 0
        total_correct += stats["correct"]
        total_questions += stats["total"]

        # Determine strength level
        if accuracy >= 80:
            strength = "strong"
        elif accuracy >= 50:
            strength = "medium"
        else:
            strength = "weak"

        topics.append({
            "source": source_name,
            "correct": stats["correct"],
            "total": stats["total"],
            "accuracy": accuracy,
            "strength": strength,
            "difficulties": stats["difficulties"],
        })

    topics.sort(key=lambda x: x["accuracy"])

    overall_accuracy = round((total_correct / total_questions) * 100) if total_questions > 0 else 0

    return {
        "topics": topics,
        "summary": {
            "total_quizzes": len(quizzes),
            "total_questions": total_questions,
            "total_correct": total_correct,
            "overall_accuracy": overall_accuracy,
        },
    }


def get_document_insights(workspace_id: str, user_id: str, db: Session) -> dict:
    """Which PDFs are most referenced."""
    pdfs = db.query(WorkspacePDF).filter(WorkspacePDF.workspace_id == workspace_id).all()

    conversations = db.query(Conversation).filter(
        Conversation.workspace_id == workspace_id, Conversation.user_id == user_id
    ).all()
    convo_ids = [c.id for c in conversations]

    # Count messages with source references per PDF
    pdf_usage = {}
    if convo_ids:
        messages = (
            db.query(Message)
            .filter(Message.conversation_id.in_(convo_ids), Message.metadata_json.isnot(None))
            .all()
        )
        for m in messages:
            try:
                meta = json.loads(m.metadata_json)
                sources = meta.get("sources", [])
                for src in sources:
                    source_name = src.get("source", "unknown") if isinstance(src, dict) else str(src)
                    pdf_usage[source_name] = pdf_usage.get(source_name, 0) + 1
            except (json.JSONDecodeError, TypeError):
                continue

    pdf_insights = []
    for p in pdfs:
        usage = pdf_usage.get(p.filename, 0)
        pdf_insights.append({
            "pdf_id": p.id,
            "filename": p.display_name or p.filename,
            "pages": p.pages,
            "chunks": p.chunks_count,
            "references": usage,
            "is_active": p.is_active,
        })

    pdf_insights.sort(key=lambda x: x["references"], reverse=True)

    return {
        "pdfs": pdf_insights,
        "total_references": sum(pdf_usage.values()),
    }
