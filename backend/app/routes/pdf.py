import os
import traceback
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..utils.helpers import save_upload_file
from ..services.loader import process_and_index
from ..utils.config import PDF_DIR, MAX_UPLOAD_BYTES
from ..utils.logger import logger
from ..database import get_db
from ..models import User, Conversation
from ..auth import get_current_user

from langchain_community.document_loaders import PyMuPDFLoader, PDFPlumberLoader

router = APIRouter()


def _uuid_storage_filename(ext: str) -> str:
    return f"{uuid.uuid4().hex}{ext}"


def _validate_pdf_signature(path: str):
    with open(path, "rb") as f:
        signature = f.read(5)
    if signature != b"%PDF-":
        raise HTTPException(status_code=400, detail="Invalid PDF file signature.")


@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    conversation_id: str = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a PDF and index it. Optionally associates with a conversation."""
    original_filename = os.path.basename(file.filename or "").strip() or "uploaded_file.pdf"
    if not original_filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if file.content_type and file.content_type.lower() != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid MIME type. Only application/pdf is allowed.")

    # Verify conversation ownership if provided
    convo = None
    if conversation_id:
        convo = db.query(Conversation).filter(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        ).first()
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found.")

    dest = os.path.join(PDF_DIR, _uuid_storage_filename(".pdf"))
    try:
        await save_upload_file(file, dest, max_bytes=MAX_UPLOAD_BYTES)
        _validate_pdf_signature(dest)
    except ValueError:
        raise HTTPException(status_code=413, detail=f"File too large. Max allowed is {MAX_UPLOAD_BYTES // (1024 * 1024)}MB.")
    except HTTPException:
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except OSError:
                logger.warning(f"Could not delete invalid PDF file: {dest}")
        raise

    try:
        # Load PDF
        try:
            loader = PyMuPDFLoader(dest)
            documents = loader.load()
            logger.info(f"Loaded {len(documents)} pages using PyMuPDFLoader.")
        except Exception as e:
            logger.warning(f"PyMuPDF failed: {e}. Falling back to PDFPlumberLoader.")
            loader = PDFPlumberLoader(dest)
            documents = loader.load()

        # Preprocess
        cleaned_docs = []
        for doc in documents:
            text = doc.page_content
            text = " ".join(text.split())
            text = text.replace("###", "\n\n### ").replace("```", "\n```")
            text = text.replace("Table", "\nTable").replace("Figure", "\nFigure")
            cleaned_docs.append({"page_content": text, "metadata": doc.metadata})

        # Index chunks (legacy route, uses session_id for backwards compat)
        added_chunks = process_and_index(
            dest,
            cleaned_docs,
            session_id=conversation_id,
            original_filename=original_filename,
        )

        return JSONResponse({
            "message": f"{original_filename} processed successfully!",
            "chunks_added": added_chunks,
            "pages": len(cleaned_docs),
        })

    except Exception as e:
        logger.error(f"Error processing PDF: {e}\n{traceback.format_exc()}")
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except OSError:
                logger.warning(f"Could not delete failed upload file: {dest}")
        raise HTTPException(status_code=500, detail=f"Error processing {original_filename}: {str(e)}")
