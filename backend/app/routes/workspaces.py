import os
import traceback
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from ..database import get_db
from ..models import User, Workspace, WorkspacePDF, Conversation
from ..auth import get_current_user
from ..utils.helpers import save_upload_file
from ..services.loader import process_and_index
from ..services.vectordb import vectorstore
from ..services.ocr import extract_text_from_image
from ..utils.config import PDF_DIR
from ..utils.logger import logger

from langchain_community.document_loaders import PyMuPDFLoader, PDFPlumberLoader

router = APIRouter()
SUPPORTED_UPLOAD_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}


# ── Request models ──
class CreateWorkspaceRequest(BaseModel):
    title: str = "New Workspace"


class RenameRequest(BaseModel):
    title: str


class UpdateTagsRequest(BaseModel):
    tags: str


# ── Helper ──
def _get_workspace(ws_id: str, user: User, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.id == ws_id, Workspace.user_id == user.id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return ws


# ═══════════════════════════════════════════
#  WORKSPACE CRUD
# ═══════════════════════════════════════════
@router.get("/")
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wss = db.query(Workspace).filter(Workspace.user_id == user.id).order_by(desc(Workspace.updated_at)).all()
    return {
        "workspaces": [
            {
                "id": w.id,
                "title": w.title,
                "pdf_count": len(w.pdfs),
                "conversation_count": len(w.conversations),
                "created_at": w.created_at.isoformat() if w.created_at else None,
                "updated_at": w.updated_at.isoformat() if w.updated_at else None,
            }
            for w in wss
        ]
    }


@router.post("/")
def create_workspace(req: CreateWorkspaceRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = Workspace(user_id=user.id, title=req.title)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return {"id": ws.id, "title": ws.title}


@router.patch("/{ws_id}/rename")
def rename_workspace(ws_id: str, req: RenameRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_workspace(ws_id, user, db)
    ws.title = req.title
    db.commit()
    return {"message": "Renamed", "title": ws.title}


@router.delete("/{ws_id}")
def delete_workspace(ws_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_workspace(ws_id, user, db)
    # Clean up FAISS vectors for all PDFs in this workspace
    vectorstore.delete_by_metadata({"workspace_id": ws_id})
    for pdf in ws.pdfs:
        vectorstore.delete_by_metadata({"filename": pdf.filename})
        file_path = os.path.join(PDF_DIR, pdf.filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
    db.delete(ws)
    db.commit()
    return {"message": "Workspace deleted."}


# ═══════════════════════════════════════════
#  PDF MANAGEMENT
# ═══════════════════════════════════════════
@router.get("/{ws_id}/pdfs")
def list_pdfs(ws_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_workspace(ws_id, user, db)
    return {
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
        ]
    }


@router.post("/{ws_id}/upload")
async def upload_pdf_to_workspace(
    ws_id: str,
    file: UploadFile = File(...),
    tags: str = Form(""),
    display_name: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = _get_workspace(ws_id, user, db)

    _, ext = os.path.splitext(file.filename.lower())
    if ext not in SUPPORTED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Supported files: PDF, PNG, JPG, JPEG, WEBP, BMP, TIFF.",
        )

    dest = os.path.join(PDF_DIR, file.filename)
    await save_upload_file(file, dest)

    # Deactivate all existing PDFs in this workspace so only the new one is active
    db.query(WorkspacePDF).filter(
        WorkspacePDF.workspace_id == ws.id,
        WorkspacePDF.is_active.is_(True),
    ).update({"is_active": False})

    # Create PDF record first to get the ID (is_active defaults to True)
    pdf_record = WorkspacePDF(
        workspace_id=ws.id,
        filename=file.filename,
        display_name=display_name or file.filename,
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
                loader = PyMuPDFLoader(dest)
                documents = loader.load()
            except Exception as e:
                logger.warning(f"PyMuPDF failed: {e}. Falling back.")
                loader = PDFPlumberLoader(dest)
                documents = loader.load()

            for doc in documents:
                text = doc.page_content
                text = " ".join(text.split())
                text = text.replace("###", "\n\n### ").replace("```", "\n```")
                text = text.replace("Table", "\nTable").replace("Figure", "\nFigure")
                cleaned_docs.append({"page_content": text, "metadata": doc.metadata})
        else:
            # OCR flow for image documents
            text = extract_text_from_image(dest)
            cleaned_docs.append(
                {
                    "page_content": text,
                    "metadata": {"page": 1, "filename": file.filename, "file_type": "image"},
                }
            )

        # Index chunks with workspace_id and pdf_id in metadata
        added_chunks = process_and_index(
            dest, cleaned_docs,
            workspace_id=ws.id,
            pdf_id=pdf_record.id,
        )

        # Update record
        pdf_record.chunks_count = added_chunks
        pdf_record.pages = len(cleaned_docs)
        db.commit()

        return JSONResponse({
            "message": f"{file.filename} added to workspace and indexed!",
            "pdf_id": pdf_record.id,
            "chunks_added": added_chunks,
            "pages": len(cleaned_docs),
        })

    except Exception as e:
        logger.error(f"Error processing PDF: {e}\n{traceback.format_exc()}")
        db.delete(pdf_record)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error processing {file.filename}: {str(e)}")


@router.delete("/{ws_id}/pdfs/{pdf_id}")
def remove_pdf(ws_id: str, pdf_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_workspace(ws_id, user, db)
    pdf = db.query(WorkspacePDF).filter(WorkspacePDF.id == pdf_id, WorkspacePDF.workspace_id == ws_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found.")
    # Clean up FAISS vectors for this PDF (by pdf_id, then by filename as fallback)
    deleted_count = vectorstore.delete_by_metadata({"pdf_id": pdf_id})
    if deleted_count == 0:
        vectorstore.delete_by_metadata({"filename": pdf.filename})
    # Delete the physical file
    file_path = os.path.join(PDF_DIR, pdf.filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            logger.warning(f"Could not delete file: {file_path}")
    db.delete(pdf)
    db.commit()
    return {"message": f"{pdf.filename} removed."}


@router.patch("/{ws_id}/pdfs/{pdf_id}/toggle")
def toggle_pdf(ws_id: str, pdf_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_workspace(ws_id, user, db)
    pdf = db.query(WorkspacePDF).filter(WorkspacePDF.id == pdf_id, WorkspacePDF.workspace_id == ws_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found.")
    pdf.is_active = not pdf.is_active
    db.commit()
    return {"is_active": pdf.is_active, "filename": pdf.filename}


@router.patch("/{ws_id}/pdfs/{pdf_id}/tags")
def update_pdf_tags(ws_id: str, pdf_id: str, req: UpdateTagsRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_workspace(ws_id, user, db)
    pdf = db.query(WorkspacePDF).filter(WorkspacePDF.id == pdf_id, WorkspacePDF.workspace_id == ws_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found.")
    pdf.tags = req.tags
    db.commit()
    return {"tags": pdf.tags}


# ═══════════════════════════════════════════
#  CONVERSATIONS WITHIN WORKSPACE
# ═══════════════════════════════════════════
@router.get("/{ws_id}/conversations")
def list_workspace_conversations(ws_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_workspace(ws_id, user, db)
    return {
        "conversations": [
            {
                "id": c.id,
                "title": c.title,
                "message_count": len(c.messages),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in ws.conversations
        ]
    }


@router.post("/{ws_id}/conversations")
def create_workspace_conversation(ws_id: str, req: CreateWorkspaceRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _get_workspace(ws_id, user, db)
    convo = Conversation(workspace_id=ws.id, user_id=user.id, title=req.title or "New Chat")
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return {"id": convo.id, "title": convo.title}
