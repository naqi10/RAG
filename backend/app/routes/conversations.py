import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Conversation, Message
from ..auth import get_current_user

router = APIRouter()


class RenameRequest(BaseModel):
    title: str


@router.patch("/{convo_id}/rename")
def rename_conversation(
    convo_id: str,
    req: RenameRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = db.query(Conversation).filter(Conversation.id == convo_id, Conversation.user_id == user.id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    convo.title = req.title
    db.commit()
    return {"message": "Renamed", "title": convo.title}


@router.delete("/{convo_id}")
def delete_conversation(
    convo_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = db.query(Conversation).filter(Conversation.id == convo_id, Conversation.user_id == user.id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    db.delete(convo)
    db.commit()
    return {"message": "Conversation deleted."}


@router.get("/{convo_id}/messages")
def get_messages(
    convo_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = db.query(Conversation).filter(Conversation.id == convo_id, Conversation.user_id == user.id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    messages = db.query(Message).filter(Message.conversation_id == convo_id).order_by(Message.created_at).all()
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "text": m.text,
                "metadata": json.loads(m.metadata_json) if m.metadata_json else None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]
    }


@router.get("/{convo_id}/export")
def export_conversation(
    convo_id: str,
    format: str = "json",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = db.query(Conversation).filter(Conversation.id == convo_id, Conversation.user_id == user.id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    messages = db.query(Message).filter(Message.conversation_id == convo_id).order_by(Message.created_at).all()

    if format == "txt":
        lines = [f"Conversation: {convo.title}", "=" * 50, ""]
        for m in messages:
            prefix = "You" if m.role == "user" else "Assistant"
            ts = m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""
            lines.extend([f"[{prefix}] ({ts})", m.text, ""])
        return {"content": "\n".join(lines), "format": "txt", "filename": f"{convo.title}.txt"}

    data = {
        "title": convo.title,
        "created_at": convo.created_at.isoformat() if convo.created_at else None,
        "messages": [
            {
                "role": m.role,
                "text": m.text,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "metadata": json.loads(m.metadata_json) if m.metadata_json else None,
            }
            for m in messages
        ],
    }
    return {"content": data, "format": "json", "filename": f"{convo.title}.json"}
