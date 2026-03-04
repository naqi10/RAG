import json
import re
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..services.llm import get_llm
from ..services.vectordb import vectorstore
from ..services.reranker import rerank_documents
from ..services.prompt import build_mindmap_prompt, build_structured_summary_prompt
from ..utils.logger import logger
from ..database import get_db
from ..models import User, WorkspacePDF
from ..auth import get_current_user

router = APIRouter()

RETRIEVER_K = 6
RERANK_TOP_N = 3


class MindMapRequest(BaseModel):
    query: str
    workspace_id: str
    active_pdf_ids: Optional[List[str]] = None
    detail_level: Optional[str] = "detailed"  # overview, detailed, exhaustive


class SummaryRequest(BaseModel):
    query: str
    workspace_id: str
    active_pdf_ids: Optional[List[str]] = None
    format_type: Optional[str] = "outline"  # outline, cornell, key_concepts


def _resolve_page(metadata):
    for candidate in [metadata.get("page"), metadata.get("page_number"), metadata.get("page_index")]:
        if candidate is None:
            continue
        try:
            v = int(candidate)
        except (TypeError, ValueError):
            continue
        if v < 0:
            return None
        return v + 1 if v == 0 else v
    return None


def _get_active_pdf_ids(workspace_id, explicit_ids, db):
    if explicit_ids:
        return explicit_ids
    if not workspace_id:
        return []
    active_pdfs = db.query(WorkspacePDF).filter(
        WorkspacePDF.workspace_id == workspace_id,
        WorkspacePDF.is_active.is_(True),
    ).all()
    return [p.id for p in active_pdfs]


def _get_active_pdf_filenames(workspace_id, explicit_ids, db):
    if explicit_ids:
        pdfs = db.query(WorkspacePDF).filter(WorkspacePDF.id.in_(explicit_ids)).all()
    elif workspace_id:
        pdfs = db.query(WorkspacePDF).filter(
            WorkspacePDF.workspace_id == workspace_id,
            WorkspacePDF.is_active.is_(True),
        ).all()
    else:
        return []
    return [p.filename for p in pdfs if p.filename]


def _filter_docs_by_active_pdfs(docs, active_pdf_ids):
    if not active_pdf_ids:
        return docs
    filtered = []
    for d in docs:
        md = getattr(d, "metadata", {}) or {}
        if md.get("pdf_id") in active_pdf_ids:
            filtered.append(d)
    return filtered


def _parse_json_output(raw_text):
    if not raw_text:
        return {}
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            return json.loads(match.group(0))
        raise


def _retrieve_and_prepare(query, workspace_id, active_pdf_ids, db):
    """Common retrieval pipeline for mindmap endpoints."""
    if vectorstore.store is None:
        raise HTTPException(status_code=400, detail="No documents indexed. Upload PDFs first.")

    active_ids = _get_active_pdf_ids(workspace_id, active_pdf_ids, db)

    # Filtered retrieval with fallback chain:
    # 1. pdf_id → 2. workspace_id → 3. filename (legacy uploads)
    docs = []
    if active_ids:
        docs = vectorstore.search_with_filter(query, k=RETRIEVER_K, filter_dict={"pdf_id": active_ids})
    if not docs and workspace_id:
        docs = vectorstore.search_with_filter(query, k=RETRIEVER_K, filter_dict={"workspace_id": workspace_id})
    if not docs:
        filenames = _get_active_pdf_filenames(workspace_id, active_pdf_ids, db)
        if filenames:
            docs = vectorstore.search_with_filter(query, k=RETRIEVER_K, filter_dict={"filename": filenames})
    if not docs:
        raise HTTPException(status_code=404, detail="No relevant content found in your active documents.")

    used_docs = rerank_documents(query, docs, top_n=RERANK_TOP_N)

    chunks = []
    for d in used_docs:
        md = getattr(d, "metadata", {}) or {}
        chunks.append({
            "text": d.page_content if hasattr(d, "page_content") else str(d),
            "source": md.get("source", "unknown"),
            "page": _resolve_page(md),
        })

    if not chunks:
        raise HTTPException(status_code=500, detail="Unable to prepare document chunks.")

    return chunks


@router.post("/generate")
def generate_mindmap(
    req: MindMapRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chunks = _retrieve_and_prepare(req.query, req.workspace_id, req.active_pdf_ids, db)
    detail_level = req.detail_level or "detailed"

    prompt = build_mindmap_prompt(chunks, "", detail_level=detail_level)
    llm = get_llm()

    try:
        chain = prompt | llm
        result = chain.invoke({})
        raw_text = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mind map generation failed: {exc}")

    try:
        mindmap = _parse_json_output(raw_text)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to parse mind map output.")

    return {
        "task_type": "mindmap",
        "mindmap": mindmap,
        "detail_level": detail_level,
        "context_count": len(chunks),
    }


@router.post("/summary")
def generate_summary(
    req: SummaryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chunks = _retrieve_and_prepare(req.query, req.workspace_id, req.active_pdf_ids, db)
    format_type = req.format_type or "outline"

    prompt = build_structured_summary_prompt(chunks, "", format_type=format_type)
    llm = get_llm()

    try:
        chain = prompt | llm
        result = chain.invoke({})
        raw_text = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {exc}")

    try:
        summary = _parse_json_output(raw_text)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to parse summary output.")

    return {
        "task_type": "structured_summary",
        "summary": summary,
        "format_type": format_type,
        "context_count": len(chunks),
    }
