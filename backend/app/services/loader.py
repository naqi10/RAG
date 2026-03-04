import os
import traceback
from typing import List, Optional, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from ..utils.file_loader import load_pdf_chunks
from .vectordb import vectorstore
from ..utils.logger import logger


def process_and_index(
    file_path: str,
    documents: Optional[List[Dict[str, Any]]] = None,
    session_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    pdf_id: Optional[str] = None,
):
    """
    Load, chunk, and index PDF data into the vectorstore.

    Args:
        file_path: Path to the PDF file.
        documents: Pre-loaded or pre-processed document data.
        session_id: Legacy session ID (kept for backwards compat).
        workspace_id: Workspace ID for scoped retrieval.
        pdf_id: WorkspacePDF record ID for per-PDF filtering.

    Returns:
        Number of chunks successfully indexed.
    """

    try:
        logger.info(f"Starting PDF processing: {os.path.basename(file_path)}")
        base_name = os.path.basename(file_path)

        if documents is None:
            logger.info("No preprocessed docs provided. Using fallback PDF loader.")
            documents = load_pdf_chunks(file_path)
        else:
            logger.info(f"Using {len(documents)} preprocessed pages passed from caller")

        docs = []
        for d in documents:
            try:
                content = d["page_content"] if isinstance(d, dict) else getattr(d, "page_content", "")
                meta = d.get("metadata", {}) if isinstance(d, dict) else getattr(d, "metadata", {})

                page_number = meta.get("page")
                if page_number is None:
                    page_number = meta.get("page_number")
                if page_number is None and meta.get("page_index") is not None:
                    page_number = meta.get("page_index")

                try:
                    page_number = int(page_number) if page_number is not None else None
                except (TypeError, ValueError):
                    page_number = None

                if page_number is not None and page_number >= 0:
                    human_page = page_number + 1
                else:
                    human_page = len(docs) + 1

                meta.update({
                    "source": file_path,
                    "filename": base_name,
                    "page": human_page,
                })
                if session_id:
                    meta["session_id"] = session_id
                if workspace_id:
                    meta["workspace_id"] = workspace_id
                if pdf_id:
                    meta["pdf_id"] = pdf_id

                if content.strip():
                    docs.append(Document(page_content=content.strip(), metadata=meta))
            except Exception as e:
                logger.warning(f"Skipped malformed page: {e}")

        if not docs:
            logger.warning(f"🚫 No valid text found in {file_path}")
            return 0

        logger.info(f" Loaded {len(docs)} document pages. Proceeding to chunking...")

        # STEP 3️⃣ - Smart, adaptive chunking strategy
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=900,
            chunk_overlap=150,
            separators=[
                "\n\n", "###", "```", "\nTable", "\nFigure", ".", "!", "?", ";", ":"
            ],
            length_function=len
        )

        chunks = text_splitter.split_documents(docs)
        if not chunks:
            logger.warning(" No chunks produced after splitting. Skipping indexing.")
            return 0

        logger.info(f"🧩 Created {len(chunks)} chunks from {len(docs)} pages.")

        # STEP 4️⃣ - Index chunks into vectorstore
        vectorstore.add_documents(chunks)
        logger.info(f"💾 Indexed {len(chunks)} chunks successfully into vectorstore.")

        return len(chunks)

    except Exception as e:
        logger.error(f"Error during PDF processing: {e}\n{traceback.format_exc()}")
        return 0
