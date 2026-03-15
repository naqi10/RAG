import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Float
from sqlalchemy.orm import relationship
from .database import Base


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    role = Column(String, default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    workspaces = relationship("Workspace", back_populates="user", cascade="all, delete-orphan")


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="New Workspace")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="workspaces")
    pdfs = relationship("WorkspacePDF", back_populates="workspace", cascade="all, delete-orphan", order_by="WorkspacePDF.created_at")
    conversations = relationship("Conversation", back_populates="workspace", cascade="all, delete-orphan", order_by="Conversation.updated_at.desc()")


class WorkspacePDF(Base):
    __tablename__ = "workspace_pdfs"

    id = Column(String, primary_key=True, default=_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    tags = Column(String, default="")
    is_active = Column(Boolean, default=True)
    chunks_count = Column(Integer, default=0)
    pages = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="pdfs")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(String, primary_key=True, default=_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="Untitled Quiz")
    quiz_type = Column(String, default="mixed")  # mcq, short_answer, mixed
    difficulty = Column(String, default="mixed")  # easy, medium, hard, mixed
    total_questions = Column(Integer, default=0)
    score = Column(Integer, nullable=True)
    max_score = Column(Integer, nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)
    status = Column(String, default="generated")  # generated, in_progress, completed
    questions_json = Column(Text, nullable=False)
    answers_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    session_type = Column(String, nullable=False)  # chat, flashcard, quiz, notes
    duration_seconds = Column(Integer, default=0)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserProfile(Base):
    """Persistent personality profile — grows with every conversation."""
    __tablename__ = "user_profiles"

    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # JSON list of study topics e.g. ["thermodynamics", "calculus", "data structures"]
    study_topics = Column(Text, default="[]")
    # Detected language preference: "english" | "urdu" | "mixed"
    preferred_language = Column(String, default="english")
    # Lifetime counters
    total_messages = Column(Integer, default=0)
    total_study_sessions = Column(Integer, default=0)
    # Last seen & last topic summary (a short plain-text sentence the LLM can read)
    last_topic_summary = Column(Text, default="")
    last_seen = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class Note(Base):
    __tablename__ = "notes"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    pdf_id = Column(String, ForeignKey("workspace_pdfs.id", ondelete="CASCADE"), nullable=True, index=True)
    note_type = Column(String, default="note")  # note, highlight, bookmark
    content = Column(Text, nullable=False)
    highlighted_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    color = Column(String, default="#10B981")
    tags = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
