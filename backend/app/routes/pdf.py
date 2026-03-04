import os
import traceback
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..utils.helpers import save_upload_file
from ..services.loader import process_and_index
from ..utils.config import PDF_DIR
from ..utils.logger import logger
from ..database import get_db
from ..models import User, Conversation
from ..auth import get_current_user

from langchain_community.document_loaders import PyMuPDFLoader, PDFPlumberLoader

router = APIRouter()


@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    conversation_id: str = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a PDF and index it. Optionally associates with a conversation."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Verify conversation ownership if provided
    convo = None
    if conversation_id:
        convo = db.query(Conversation).filter(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        ).first()
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found.")

    dest = os.path.join(PDF_DIR, file.filename)
    await save_upload_file(file, dest)

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
        added_chunks = process_and_index(dest, cleaned_docs, session_id=conversation_id)

        return JSONResponse({
            "message": f"{file.filename} processed successfully!",
            "chunks_added": added_chunks,
            "pages": len(cleaned_docs),
        })

    except Exception as e:
        logger.error(f"Error processing PDF: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing {file.filename}: {str(e)}")
