import os
import traceback
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Workspace, WorkspacePDF, Conversation
from ..auth import get_current_user
from ..utils.helpers import save_upload_file
from ..services.loader import process_and_index
from ..services.vectordb import vectorstore
from ..services.ocr import extract_text_from_image
from ..utils.config import PDF_DIR, MAX_UPLOAD_BYTES
from ..utils.logger import logger
from .workspaces import (
    SUPPORTED_UPLOAD_EXTENSIONS,
    _uuid_storage_filename,
    _validate_upload_mime,
    _validate_image_dimensions,
    _validate_pdf_signature,
)
from langchain_community.document_loaders import PyMuPDFLoader, PDFPlumberLoader

router = APIRouter()


class ConversationRequest(BaseModel):
    title: str = "New Chat"


def _get_or_create_personal_workspace(user: User, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(
        Workspace.user_id == user.id,
        Workspace.title == "__personal__",
    ).first()
    if ws:
        return ws
    ws = Workspace(user_id=user.id, title="__personal__")
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


@router.get("/pdfs")
def list_library_pdfs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_or_create_personal_workspace(user, db)
    return {
        "workspace_id": ws.id,
        "pdfs": [
            {
                "id": p.id,
                "filename": p.filename,
                "display_name": p.display_name or p.filename,
                "tags": p.tags,
                "is_active": p.is_active,
                "chunks_count": p.chunks_count,
                "pages": p.pages,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in ws.pdfs
        ],
    }


@router.post("/upload")
async def upload_to_library(
    file: UploadFile = File(...),
    tags: str = Form(""),
    display_name: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _get_or_create_personal_workspace(user, db)
    original_filename = os.path.basename(file.filename or "").strip() or "uploaded_file"
    _, ext = os.path.splitext(original_filename.lower())
    if ext not in SUPPORTED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Supported files: PDF, PNG, JPG, JPEG, WEBP, BMP, TIFF.")
    _validate_upload_mime(file, ext)

    storage_name = _uuid_storage_filename(ext)
    dest = os.path.join(PDF_DIR, storage_name)
    try:
        await save_upload_file(file, dest, max_bytes=MAX_UPLOAD_BYTES)
    except ValueError:
        raise HTTPException(status_code=413, detail=f"File too large. Max allowed is {MAX_UPLOAD_BYTES // (1024 * 1024)}MB.")

    if ext == ".pdf":
        _validate_pdf_signature(dest)
    else:
        _validate_image_dimensions(dest)

    db.query(WorkspacePDF).filter(
        WorkspacePDF.workspace_id == ws.id,
        WorkspacePDF.is_active.is_(True),
    ).update({"is_active": False})

    pdf_record = WorkspacePDF(
        workspace_id=ws.id,
        filename=original_filename,
        display_name=display_name or original_filename,
        file_path=dest,
        tags=tags,
    )
    db.add(pdf_record)
    db.commit()
    db.refresh(pdf_record)

    try:
        cleaned_docs = []
        if ext == ".pdf":
            try:
                documents = PyMuPDFLoader(dest).load()
            except Exception:
                documents = PDFPlumberLoader(dest).load()
            for doc in documents:
                text = " ".join(doc.page_content.split())
                text = text.replace("###", "\n\n### ").replace("```", "\n```")
                text = text.replace("Table", "\nTable").replace("Figure", "\nFigure")
                cleaned_docs.append({"page_content": text, "metadata": doc.metadata})
        else:
            text = extract_text_from_image(dest)
            cleaned_docs.append({
                "page_content": text,
                "metadata": {"page": 1, "filename": original_filename, "file_type": "image"},
            })

        added_chunks = process_and_index(
            dest,
            cleaned_docs,
            workspace_id=ws.id,
            pdf_id=pdf_record.id,
            original_filename=original_filename,
        )
        pdf_record.chunks_count = added_chunks
        pdf_record.pages = len(cleaned_docs)
        db.commit()
        return JSONResponse({
            "workspace_id": ws.id,
            "pdf_id": pdf_record.id,
            "message": f"{original_filename} uploaded and indexed.",
            "chunks_added": added_chunks,
            "pages": len(cleaned_docs),
        })
    except Exception as e:
        logger.error(f"Library upload failed: {e}\n{traceback.format_exc()}")
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except OSError:
                logger.warning(f"Could not delete failed upload file: {dest}")
        db.delete(pdf_record)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error processing {original_filename}: {str(e)}")


@router.patch("/pdfs/{pdf_id}/toggle")
def toggle_library_pdf(pdf_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_or_create_personal_workspace(user, db)
    pdf = db.query(WorkspacePDF).filter(WorkspacePDF.id == pdf_id, WorkspacePDF.workspace_id == ws.id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found.")
    pdf.is_active = not pdf.is_active
    db.commit()
    return {"is_active": pdf.is_active}


@router.delete("/pdfs/{pdf_id}")
def remove_library_pdf(pdf_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_or_create_personal_workspace(user, db)
    pdf = db.query(WorkspacePDF).filter(WorkspacePDF.id == pdf_id, WorkspacePDF.workspace_id == ws.id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found.")
    vectorstore.delete_by_metadata({"pdf_id": pdf.id})
    if os.path.exists(pdf.file_path):
        try:
            os.remove(pdf.file_path)
        except OSError:
            logger.warning(f"Could not delete file: {pdf.file_path}")
    db.delete(pdf)
    db.commit()
    return {"message": f"{pdf.filename} removed."}


@router.get("/conversations")
def list_library_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_or_create_personal_workspace(user, db)
    return {
        "workspace_id": ws.id,
        "conversations": [
            {
                "id": c.id,
                "title": c.title,
                "message_count": len(c.messages),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in ws.conversations
        ],
    }


@router.post("/conversations")
def create_library_conversation(
    req: ConversationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _get_or_create_personal_workspace(user, db)
    convo = Conversation(workspace_id=ws.id, user_id=user.id, title=req.title or "New Chat")
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return {"workspace_id": ws.id, "id": convo.id, "title": convo.title}
