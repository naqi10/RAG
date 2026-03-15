"""
UserProfile service — builds and maintains a persistent personality + study profile
for each user so the chatbot remembers who they are and what they study.
"""
import json
import re
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from ..models import UserProfile, User, WorkspacePDF, Conversation, Message


# ── Stopwords to filter out of topic extraction ──────────────────────────────
_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "ought",
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
    "they", "them", "their", "this", "that", "these", "those",
    "what", "which", "who", "whom", "how", "when", "where", "why",
    "and", "or", "but", "if", "because", "as", "until", "while",
    "of", "at", "by", "for", "with", "about", "against", "between",
    "into", "through", "during", "before", "after", "above", "below",
    "to", "from", "up", "down", "in", "out", "on", "off", "over",
    "tell", "explain", "give", "show", "make", "please", "can", "just",
    "me", "also", "like", "get", "let", "know", "think", "want",
    "pdf", "document", "file", "page", "chapter", "section",
    "summarize", "summary", "list", "write", "create", "generate",
    "answer", "question", "quiz", "flashcard", "note",
}

# ── Language detection (simple heuristic) ────────────────────────────────────
_URDU_PATTERN = re.compile(
    r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]"
)
_MIXED_ROMAN_URDU = re.compile(
    r"\b(kya|hai|hain|aap|tum|mein|hum|yeh|wo|kuch|kar|raha|rahi|sab|ek|do|"
    r"karo|bata|batao|tha|thi|the|nahi|nai|kyun|kaise|kitna|kitni|acha|theek|"
    r"thak|kal|aaj|abhi|phir|wala|wali|wale)\b",
    re.IGNORECASE,
)


def detect_language(text: str) -> str:
    if _URDU_PATTERN.search(text):
        return "urdu"
    roman_hits = len(_MIXED_ROMAN_URDU.findall(text))
    if roman_hits >= 2:
        return "mixed"
    return "english"


# ── Topic extraction ──────────────────────────────────────────────────────────
def extract_topics(text: str) -> list[str]:
    """Extract meaningful study-topic words from a user message."""
    words = re.findall(r"[a-zA-Z]{3,}", text.lower())
    topics = []
    for w in words:
        if w not in _STOPWORDS and len(w) >= 4:
            topics.append(w)
    # Return deduplicated list (up to 5 per message)
    seen, out = set(), []
    for t in topics:
        if t not in seen:
            seen.add(t)
            out.append(t)
        if len(out) >= 5:
            break
    return out


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_or_create(user_id: str, db: Session) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def update_from_message(user_id: str, user_message: str, db: Session) -> None:
    """
    Called after every non-casual user message.
    Updates: study_topics, preferred_language, total_messages, last_seen.
    """
    try:
        profile = get_or_create(user_id, db)

        # Merge new topics (cap at 30 total)
        existing = json.loads(profile.study_topics or "[]")
        new_topics = extract_topics(user_message)
        merged = existing + [t for t in new_topics if t not in existing]
        profile.study_topics = json.dumps(merged[-30:])

        # Language detection — update only if we detect a non-english signal
        lang = detect_language(user_message)
        if lang != "english":
            profile.preferred_language = lang

        profile.total_messages = (profile.total_messages or 0) + 1
        profile.last_seen = datetime.utcnow()
        profile.updated_at = datetime.utcnow()
        db.commit()
    except Exception:
        pass  # profile is best-effort, never block the chat


def update_last_topic_summary(user_id: str, summary: str, db: Session) -> None:
    try:
        profile = get_or_create(user_id, db)
        profile.last_topic_summary = summary[:500]
        profile.updated_at = datetime.utcnow()
        db.commit()
    except Exception:
        pass


def increment_session(user_id: str, db: Session) -> None:
    try:
        profile = get_or_create(user_id, db)
        profile.total_study_sessions = (profile.total_study_sessions or 0) + 1
        profile.updated_at = datetime.utcnow()
        db.commit()
    except Exception:
        pass


# ── Context builder for LLM ───────────────────────────────────────────────────
def build_profile_context(user: User, db: Session) -> str:
    """
    Returns a short paragraph the LLM can read to know who the user is.
    Injected at the top of every system prompt.
    """
    try:
        profile = get_or_create(user.id, db)

        name = user.display_name or user.email.split("@")[0]

        topics_raw = json.loads(profile.study_topics or "[]")
        # Deduplicate and take top 10 most recent
        topics = list(dict.fromkeys(topics_raw))[-10:]

        lang_map = {
            "english": "English",
            "urdu": "Urdu / Roman Urdu",
            "mixed": "a mix of English and Urdu (Roman Urdu)",
        }
        lang_label = lang_map.get(profile.preferred_language, "English")

        lines = [f"## About this user"]
        lines.append(f"- **Name**: {name}")
        lines.append(f"- **Language preference**: {lang_label}")
        lines.append(f"- **Total study messages**: {profile.total_messages or 0}")

        if topics:
            lines.append(f"- **Topics studied so far**: {', '.join(topics)}")
        if profile.last_topic_summary:
            lines.append(f"- **Last session summary**: {profile.last_topic_summary}")

        # Active PDFs
        try:
            from ..models import Workspace, WorkspacePDF
            workspace = db.query(Workspace).filter(Workspace.user_id == user.id).first()
            if workspace:
                active_pdfs = db.query(WorkspacePDF).filter(
                    WorkspacePDF.workspace_id == workspace.id,
                    WorkspacePDF.is_active.is_(True),
                ).all()
                if active_pdfs:
                    pdf_names = [p.display_name or p.filename for p in active_pdfs[:5]]
                    lines.append(f"- **Currently active documents**: {', '.join(pdf_names)}")
        except Exception:
            pass

        return "\n".join(lines)
    except Exception:
        return ""


def build_casual_system_prompt(user: User, db: Session) -> str:
    """
    Friendly system prompt for casual/greeting messages — personalized with
    the user's name, language, and recent topics.
    """
    try:
        profile = get_or_create(user.id, db)
        name = user.display_name or user.email.split("@")[0]
        lang = profile.preferred_language or "english"
        topics_raw = json.loads(profile.study_topics or "[]")
        recent_topics = list(dict.fromkeys(topics_raw))[-5:]

        lang_instruction = {
            "urdu": "Reply in Urdu script or Roman Urdu — whichever the user used.",
            "mixed": "Reply naturally in a mix of English and Roman Urdu, matching the user's style.",
            "english": "Reply in friendly, natural English.",
        }.get(lang, "Reply in friendly, natural English.")

        topic_hint = ""
        if recent_topics:
            topic_hint = (
                f" The user has been studying: {', '.join(recent_topics)}. "
                "You may briefly reference this if relevant."
            )

        # Build a brief mention of what user can ask about
        return (
            f"You are Sheen, a friendly AI study assistant talking to {name}. "
            f"{lang_instruction} "
            f"The user just said hello or made small talk. "
            f"RULES — follow strictly:\n"
            f"1. Reply in MAXIMUM 2 sentences. Not more.\n"
            f"2. Be warm and natural — like a friend replying to a text.\n"
            f"3. Do NOT explain or summarize any PDF, document, or topic.\n"
            f"4. Do NOT mention any file names, machine learning, data, algorithms, or technical content.\n"
            f"5. After greeting them back, in ONE short sentence say you're ready to help whenever they want.\n"
            f"Example of a good reply: 'Hey! Doing great, thanks for asking 😊 Ready to help whenever you want to dive in!'"
        )
    except Exception:
        return (
            "You are Sheen, a friendly AI study assistant. "
            "The user said hello. Reply warmly in 1-2 sentences only. "
            "Do NOT reference any documents, topics, or technical content. "
            "Just greet them and say you're ready to help."
        )
