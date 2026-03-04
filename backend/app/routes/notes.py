import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..services.llm import get_llm
from ..services.prompt import SYSTEM_INSTRUCTIONS
from ..utils.logger import logger
from ..database import get_db
from ..models import User, Note, WorkspacePDF
from ..auth import get_current_user
from langchain_core.prompts import PromptTemplate

router = APIRouter()


class NoteCreateRequest(BaseModel):
    workspace_id: str
    pdf_id: Optional[str] = None
    note_type: Optional[str] = "note"  # note, highlight, bookmark
    content: str
    highlighted_text: Optional[str] = None
    page_number: Optional[int] = None
    color: Optional[str] = "#10B981"
    tags: Optional[str] = ""


class NoteUpdateRequest(BaseModel):
    content: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[str] = None
    note_type: Optional[str] = None


class NoteSummarizeRequest(BaseModel):
    workspace_id: str
    pdf_id: Optional[str] = None


@router.post("/")
def create_note(
    req: NoteCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = Note(
        user_id=user.id,
        workspace_id=req.workspace_id,
        pdf_id=req.pdf_id,
        note_type=req.note_type or "note",
        content=req.content,
        highlighted_text=req.highlighted_text,
        page_number=req.page_number,
        color=req.color or "#10B981",
        tags=req.tags or "",
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {
        "note_id": note.id,
        "note_type": note.note_type,
        "content": note.content,
        "highlighted_text": note.highlighted_text,
        "page_number": note.page_number,
        "color": note.color,
        "tags": note.tags,
        "pdf_id": note.pdf_id,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.get("/")
def list_notes(
    workspace_id: str = Query(...),
    pdf_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Note).filter(Note.user_id == user.id, Note.workspace_id == workspace_id)
    if pdf_id:
        q = q.filter(Note.pdf_id == pdf_id)
    notes = q.order_by(Note.created_at.desc()).all()

    return {
        "notes": [
            {
                "note_id": n.id,
                "note_type": n.note_type,
                "content": n.content,
                "highlighted_text": n.highlighted_text,
                "page_number": n.page_number,
                "color": n.color,
                "tags": n.tags,
                "pdf_id": n.pdf_id,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "updated_at": n.updated_at.isoformat() if n.updated_at else None,
            }
            for n in notes
        ]
    }


@router.patch("/{note_id}")
def update_note(
    note_id: str,
    req: NoteUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    if req.content is not None:
        note.content = req.content
    if req.color is not None:
        note.color = req.color
    if req.tags is not None:
        note.tags = req.tags
    if req.note_type is not None:
        note.note_type = req.note_type

    db.commit()
    return {"detail": "Note updated.", "note_id": note.id}


@router.delete("/{note_id}")
def delete_note(
    note_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"detail": "Note deleted."}


@router.get("/export")
def export_notes(
    workspace_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notes = (
        db.query(Note)
        .filter(Note.user_id == user.id, Note.workspace_id == workspace_id)
        .order_by(Note.created_at)
        .all()
    )

    # Group notes by PDF
    grouped = {}
    for n in notes:
        pdf_key = n.pdf_id or "general"
        if pdf_key not in grouped:
            grouped[pdf_key] = []
        grouped[pdf_key].append({
            "type": n.note_type,
            "content": n.content,
            "highlighted_text": n.highlighted_text,
            "page": n.page_number,
            "tags": n.tags,
        })

    # Build markdown output
    lines = ["# Study Notes\n"]
    for pdf_key, pdf_notes in grouped.items():
        if pdf_key != "general":
            pdf = db.query(WorkspacePDF).filter(WorkspacePDF.id == pdf_key).first()
            lines.append(f"\n## {pdf.display_name or pdf.filename if pdf else pdf_key}\n")
        else:
            lines.append("\n## General Notes\n")

        for note in pdf_notes:
            if note["highlighted_text"]:
                lines.append(f"> {note['highlighted_text']}")
            lines.append(f"- {note['content']}")
            if note["page"]:
                lines.append(f"  *(Page {note['page']})*")
            lines.append("")

    return {"markdown": "\n".join(lines), "total_notes": len(notes)}


@router.post("/ai-summarize")
def ai_summarize_notes(
    req: NoteSummarizeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Note).filter(Note.user_id == user.id, Note.workspace_id == req.workspace_id)
    if req.pdf_id:
        q = q.filter(Note.pdf_id == req.pdf_id)
    notes = q.order_by(Note.created_at).all()

    if not notes:
        raise HTTPException(status_code=404, detail="No notes found to summarize.")

    # Build context from notes
    context_parts = []
    for n in notes:
        parts = []
        if n.highlighted_text:
            parts.append(f"Highlighted: {n.highlighted_text}")
        parts.append(f"Note: {n.content}")
        if n.page_number:
            parts.append(f"(Page {n.page_number})")
        context_parts.append(" | ".join(parts))

    context = "\n\n".join(context_parts)

    prompt = PromptTemplate.from_template(
        "You are a study assistant. Summarize the following student notes into a clear, "
        "well-organized summary. Group related concepts together. Highlight key takeaways.\n\n"
        "Notes:\n{context}\n\nProvide a structured summary with key themes and takeaways."
    )

    try:
        llm = get_llm()
        chain = prompt | llm
        result = chain.invoke({"context": context})
        summary = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {exc}")

    return {"summary": summary.strip(), "notes_count": len(notes)}
