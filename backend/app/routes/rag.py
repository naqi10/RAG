import json
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import PromptTemplate

from ..services.intent import detect_intent
from ..services.llm import get_llm
from ..services.vectordb import vectorstore
from ..services.memory import memory
from ..services.reranker import rerank_documents
from ..services.prompt import (
    build_qa_prompt,
    build_summarize_prompt,
    build_json_prompt,
    build_exam_prompt,
    build_flashcard_prompt,
    SYSTEM_INSTRUCTIONS,
)
from ..utils.logger import logger

# ── Reranker config ──
RETRIEVER_K = 6    # fetch this many from FAISS (lower = faster)
RERANK_TOP_N = 3   # keep this many after cross-encoder reranking
from ..database import get_db
from ..models import User, Conversation, Message, Workspace, WorkspacePDF
from ..auth import get_current_user

router = APIRouter()


# ── Request models ──
class QueryRequest(BaseModel):
    query: str
    k: Optional[int] = 4
    conversation_id: Optional[str] = None
    workspace_id: Optional[str] = None
    active_pdf_ids: Optional[List[str]] = None


class FlashcardRequest(BaseModel):
    query: str
    k: Optional[int] = 4
    conversation_id: Optional[str] = None
    workspace_id: Optional[str] = None
    active_pdf_ids: Optional[List[str]] = None
    n_cards: Optional[int] = 10


# ── Helpers ──
def _verify_conversation(convo_id: str, user: User, db: Session) -> Conversation:
    convo = db.query(Conversation).filter(
        Conversation.id == convo_id, Conversation.user_id == user.id
    ).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return convo


def _get_active_pdf_ids(workspace_id: str, explicit_ids: Optional[List[str]], db: Session) -> List[str]:
    """Get active PDF IDs for a workspace. If explicit_ids given, use those; otherwise use DB is_active flag."""
    if explicit_ids:
        return explicit_ids
    if not workspace_id:
        return []
    active_pdfs = db.query(WorkspacePDF).filter(
        WorkspacePDF.workspace_id == workspace_id,
        WorkspacePDF.is_active.is_(True),
    ).all()
    return [p.id for p in active_pdfs]


def _get_active_pdf_filenames(workspace_id: str, explicit_ids: Optional[List[str]], db: Session) -> List[str]:
    """Get filenames of active PDFs for filename-based fallback filtering."""
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


def _load_history_from_db(convo_id: str, db: Session) -> List[Message]:
    """Load all messages for a conversation from DB."""
    return (
        db.query(Message)
        .filter(Message.conversation_id == convo_id)
        .order_by(Message.created_at)
        .all()
    )


def _format_db_history(db_messages: List[Message]) -> str:
    """Format DB messages into a text string for LLM prompts."""
    if not db_messages:
        return ""
    lines = []
    for m in db_messages:
        lines.append(f"{m.role}: {m.text}")
    return "\n".join(lines)


def _save_message(db: Session, convo_id: str, role: str, text: str, meta: dict = None):
    """Save a message to the database."""
    msg = Message(
        conversation_id=convo_id,
        role=role,
        text=text,
        metadata_json=json.dumps(meta) if meta else None,
    )
    db.add(msg)
    db.commit()


def _filter_docs_by_active_pdfs(docs: List[Any], active_pdf_ids: List[str]) -> List[Any]:
    """Filter retrieved docs to only those belonging to active PDFs in the workspace."""
    if not active_pdf_ids:
        return docs
    filtered = []
    for d in docs:
        md = getattr(d, "metadata", {}) or {}
        if md.get("pdf_id") in active_pdf_ids or md.get("workspace_id") and not md.get("pdf_id"):
            filtered.append(d)
    return filtered


def _filter_docs_by_workspace(docs: List[Any], workspace_id: Optional[str]) -> List[Any]:
    """Fallback: filter by workspace_id if no pdf_id-level filtering."""
    if not workspace_id:
        return docs
    filtered = []
    for d in docs:
        md = getattr(d, "metadata", {}) or {}
        if md.get("workspace_id") == workspace_id or md.get("session_id") == workspace_id:
            filtered.append(d)
    return filtered


def _resolve_page(metadata: Dict[str, Any]) -> Optional[int]:
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


def _prepare_flashcard_prompt_template() -> PromptTemplate:
    template_body = """
{system_instructions}

You are assisting a student by turning retrieved document excerpts into flashcards.

Chat History:
{chat_history}

User Query:
{input}

Context:
{context}

Task:
Create {n_cards} concise flashcards. Each flashcard must include:
- question: a single sentence question or prompt
- answer: a concise answer grounded strictly in the context
- source: the supporting document name and, if available, the page number

Return strictly as a JSON array of objects using the keys 'question', 'answer', and 'source'.
Do not include any commentary outside the JSON array.
"""
    base_prompt = PromptTemplate(
        input_variables=["context", "input", "chat_history", "n_cards", "system_instructions"],
        template=template_body,
    )
    return base_prompt.partial(system_instructions=SYSTEM_INSTRUCTIONS)


def _deduplicate_sources(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[Tuple[str, Optional[int]]] = set()
    unique: List[Dict[str, Any]] = []
    for c in chunks:
        key = (c.get("source") or "unknown", c.get("page"))
        if key not in seen:
            seen.add(key)
            unique.append({"source": key[0], "page": key[1]})
    return unique


def _parse_flashcards_output(raw_text: str) -> List[Dict[str, Any]]:
    if not raw_text:
        return []
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if not match:
            raise
        payload = json.loads(match.group(0))
    if isinstance(payload, dict):
        payload = payload.get("flashcards") or payload.get("cards") or payload.get("data")
    if not isinstance(payload, list):
        raise ValueError("Flashcard payload is not a list.")
    normalized: List[Dict[str, Any]] = []
    for card in payload:
        if not isinstance(card, dict):
            continue
        question = card.get("question") or card.get("front") or card.get("prompt") or ""
        answer = card.get("answer") or card.get("back") or card.get("response") or ""
        source_info = card.get("source") or card.get("reference") or {}
        if isinstance(source_info, str):
            source_info = {"source": source_info, "page": None}
        elif not isinstance(source_info, dict):
            source_info = {"source": "unknown", "page": None}
        normalized.append({
            "question": question.strip(),
            "answer": answer.strip(),
            "source": {"source": source_info.get("source", "unknown"), "page": source_info.get("page")},
        })
    return [c for c in normalized if c["question"] and c["answer"]]


def _tokenize_text(text: str) -> set:
    return set(re.findall(r"\w+", text.lower()))


def _score_chunk_for_flashcard(card_text: str, chunk_text: str) -> float:
    if not card_text or not chunk_text:
        return 0.0
    card_tokens = _tokenize_text(card_text)
    if not card_tokens:
        return 0.0
    chunk_tokens = _tokenize_text(chunk_text)
    overlap = card_tokens.intersection(chunk_tokens)
    return len(overlap) / len(card_tokens) if overlap else 0.0


def _assign_sources_to_flashcards(flashcards: list, chunks: list) -> list:
    if not flashcards or not chunks:
        return flashcards
    for card in flashcards:
        best_chunk = None
        best_score = 0.0
        combined = f"{card.get('question', '')} {card.get('answer', '')}".strip()
        for chunk in chunks:
            score = _score_chunk_for_flashcard(combined, chunk.get("text", ""))
            if score > best_score:
                best_score = score
                best_chunk = chunk
        if best_chunk is None and chunks:
            best_chunk = chunks[0]
        chapter = best_chunk.get("chapter") if best_chunk else None
        source_name = chapter or (best_chunk.get("source") if best_chunk else "unknown")
        page_number = best_chunk.get("page") if best_chunk else None
        existing_source = card.get("source") if isinstance(card.get("source"), dict) else {}
        card["source"] = {
            "source": source_name or existing_source.get("source", "unknown"),
            "page": page_number if page_number is not None else existing_source.get("page"),
        }
    return flashcards


# ═══════════════════════════════════════════
#  FLASHCARDS ENDPOINT
# ═══════════════════════════════════════════
@router.post("/flashcards")
def generate_flashcards_endpoint(
    req: FlashcardRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if vectorstore.store is None:
        raise HTTPException(status_code=400, detail="No documents indexed. Upload PDFs first.")

    convo_id = req.conversation_id
    if convo_id:
        _verify_conversation(convo_id, user, db)

    n_cards = req.n_cards if req.n_cards and req.n_cards > 0 else 10
    retriever = vectorstore.as_retriever()
    retriever.search_kwargs["k"] = RETRIEVER_K
    llm = get_llm()

    # Load history from DB
    chat_history_text = "No prior chat history."
    if convo_id:
        db_messages = _load_history_from_db(convo_id, db)
        memory.load_from_db(convo_id, db_messages)
        db_history = _format_db_history(db_messages)
        if db_history:
            chat_history_text = db_history
        similar_past = memory.search_semantic_memory(convo_id, req.query)
        if similar_past:
            chat_history_text += "\n\n[Related Past Conversations]\n" + "\n".join(similar_past)

    # Get active PDFs for workspace-scoped filtering
    active_pdf_ids = _get_active_pdf_ids(req.workspace_id, req.active_pdf_ids, db) if req.workspace_id else []

    # Filtered retrieval with fallback chain:
    # 1. pdf_id → 2. workspace_id → 3. filename (legacy uploads)
    docs = []
    if active_pdf_ids:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"pdf_id": active_pdf_ids})
    if not docs and req.workspace_id:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"workspace_id": req.workspace_id})
    if not docs:
        filenames = _get_active_pdf_filenames(req.workspace_id, req.active_pdf_ids, db)
        if filenames:
            docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"filename": filenames})
    if not docs:
        raise HTTPException(status_code=404, detail="No relevant content found in your active documents.")

    # Cross-encoder reranking: pick the most relevant chunks
    used_docs = rerank_documents(req.query, docs, top_n=RERANK_TOP_N)

    chunks: list[dict] = []
    for doc in used_docs:
        md = getattr(doc, "metadata", {}) or {}
        chunks.append({
            "text": getattr(doc, "page_content", ""),
            "source": md.get("source", "unknown"),
            "chapter": md.get("chapter") or md.get("section"),
            "page": _resolve_page(md),
        })
    if not chunks:
        raise HTTPException(status_code=500, detail="Unable to prepare document chunks.")

    flashcard_prompt = _prepare_flashcard_prompt_template()
    try:
        combine_docs_chain = create_stuff_documents_chain(llm=llm, prompt=flashcard_prompt, document_variable_name="context")
        qa_chain = create_retrieval_chain(retriever=retriever, combine_docs_chain=combine_docs_chain)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build flashcard chain: {exc}")

    invoke_payload = {
        "input": req.query,
        "chat_history": chat_history_text,
        "n_cards": str(n_cards),
        "context": "\n".join([c["text"] for c in chunks]),
        "source": ", ".join([c["source"] for c in chunks]),
        "page": ", ".join([str(c["page"]) for c in chunks]),
        "system_instructions": SYSTEM_INSTRUCTIONS,
    }

    try:
        result = qa_chain.invoke(invoke_payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Flashcard generation failed: {exc}")

    raw_answer = result.get("answer") if isinstance(result, dict) else str(result)

    try:
        flashcards = _parse_flashcards_output(raw_answer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse flashcards: {exc}")
    if not flashcards:
        raise HTTPException(status_code=502, detail="Model did not return any flashcards.")

    flashcards = flashcards[:n_cards]
    flashcards = _assign_sources_to_flashcards(flashcards, chunks)
    sources = _deduplicate_sources(chunks)

    try:
        summary_prompt = PromptTemplate.from_template(
            "You are a summarization assistant.\nSummarize the following content in 3-5 clear sentences.\n\nContent:\n{context}"
        )
        summary_chain = summary_prompt | llm
        summary_result = summary_chain.invoke({"context": "\n".join([c["text"] for c in chunks])})
        summary_text = summary_result.strip() if isinstance(summary_result, str) else str(summary_result)
    except Exception:
        summary_text = "Summary unavailable."

    # Save to DB and memory
    if convo_id:
        try:
            _save_message(db, convo_id, "user", req.query)
            _save_message(db, convo_id, "assistant", json.dumps({"flashcards": len(flashcards), "summary": summary_text}))
            memory.append(convo_id, "user", req.query)
            memory.append(convo_id, "assistant", f"Generated {len(flashcards)} flashcards")
        except Exception:
            logger.exception("Failed to save flashcard interaction")

    return {
        "task_type": "flashcards",
        "summary": summary_text,
        "flashcards": flashcards,
        "sources": sources,
        "context_count": len(chunks),
        "confidence": "Medium",
    }


# ═══════════════════════════════════════════
#  ASK (CHAT) ENDPOINT
# ═══════════════════════════════════════════
@router.post("/ask")
def ask(
    req: QueryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if vectorstore.store is None:
        raise HTTPException(status_code=400, detail="No documents indexed. Upload PDFs first.")

    convo_id = req.conversation_id
    if convo_id:
        _verify_conversation(convo_id, user, db)

    retriever = vectorstore.as_retriever()
    retriever.search_kwargs["k"] = RETRIEVER_K
    llm = get_llm()
    max_lines = 0

    # Load history from DB
    formatted_history = ""
    if convo_id:
        db_messages = _load_history_from_db(convo_id, db)
        memory.load_from_db(convo_id, db_messages)
        formatted_history = _format_db_history(db_messages)
        similar_past = memory.search_semantic_memory(convo_id, req.query)
        if similar_past:
            formatted_history = (formatted_history + "\n\n[Related Past Conversations]\n" + "\n".join(similar_past)).strip()

    logger.info(f"Conversation {convo_id}: history lines={len(formatted_history.splitlines())}")

    # Get active PDFs for workspace-scoped filtering
    active_pdf_ids = _get_active_pdf_ids(req.workspace_id, req.active_pdf_ids, db) if req.workspace_id else []

    # Filtered retrieval with fallback chain:
    # 1. Try pdf_id (workspace uploads with metadata)
    # 2. Try workspace_id (workspace-tagged chunks)
    # 3. Try filename (matches ALL copies including legacy uploads)
    # 4. Direct metadata lookup (for meta questions with no semantic match)
    filenames = _get_active_pdf_filenames(req.workspace_id, req.active_pdf_ids, db)
    docs = []
    if active_pdf_ids:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"pdf_id": active_pdf_ids})
    if not docs and req.workspace_id:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"workspace_id": req.workspace_id})
    if not docs and filenames:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"filename": filenames})
    if not docs and filenames:
        # Last resort: grab some chunks directly by metadata (handles meta/conversational questions)
        docs = vectorstore.get_docs_by_metadata({"filename": filenames}, k=RETRIEVER_K)
    if not docs:
        return {"answer": "No relevant content found in your active documents. Make sure PDFs are uploaded and active in the sidebar.", "sources": []}

    # Cross-encoder reranking: pick the most relevant chunks
    used_docs = rerank_documents(req.query, docs, top_n=RERANK_TOP_N)

    chunks = []
    for d in used_docs:
        md = getattr(d, "metadata", {}) or {}
        chunks.append({
            "text": d.page_content if hasattr(d, "page_content") else str(d),
            "source": md.get("source", "unknown"),
            "page": _resolve_page(md),
        })

    try:
        task_type = detect_intent(req.query)
        if task_type == "summary":
            prompt = build_summarize_prompt(chunks, formatted_history, style="academic")
        elif task_type == "flashcards":
            prompt = build_flashcard_prompt(chunks, formatted_history, n_cards=10)
        elif task_type == "exam":
            prompt = build_exam_prompt(chunks, formatted_history, n_questions=10, difficulty="mixed", format="MARKDOWN")
        elif task_type == "json":
            prompt = build_json_prompt(req.query, chunks, formatted_history)
        else:
            match = re.search(r"in (\d+)\s*lines", req.query.lower())
            max_lines = int(match.group(1)) if match else 0
            prompt = build_qa_prompt(req.query, chunks, formatted_history, style="academic", max_lines=max_lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prompt generation failed: {e}")

    try:
        if hasattr(prompt, "input_variables") and "context" not in prompt.input_variables:
            prompt = PromptTemplate(
                input_variables=list(prompt.input_variables) + ["context"],
                template=(prompt.template if hasattr(prompt, "template") else str(prompt)) + "\n\n{context}",
            )
    except Exception:
        prompt = PromptTemplate(
            input_variables=["system_instructions", "context", "chat_history", "input", "style", "max_lines"],
            template="{system_instructions}\n\nChat History:\n{chat_history}\n\nContext:\n{context}\n\nQuestion:\n{input}\n\nStyle: {style}\nAnswer in {max_lines} lines (if specified).\n",
        )

    try:
        combine_docs_chain = create_stuff_documents_chain(llm=llm, prompt=prompt, document_variable_name="context")
        qa = create_retrieval_chain(retriever=retriever, combine_docs_chain=combine_docs_chain)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build retrieval chain: {e}")

    invoke_inputs: Dict[str, Any] = {
        "input": req.query,
        "chat_history": formatted_history,
        "max_lines": max_lines,
        "system_instructions": SYSTEM_INSTRUCTIONS,
        "style": "academic",
    }

    try:
        result = qa.invoke(invoke_inputs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chain invocation failed: {e}")

    answer = None
    if isinstance(result, dict):
        answer = result.get("answer") or result.get("result") or result.get("output")
    elif isinstance(result, str):
        answer = result
    answer = answer or "No answer generated."

    source_docs = []
    raw_sources = result.get("source_documents") or result.get("context") or result.get("sources") or []
    for item in raw_sources:
        md = getattr(item, "metadata", None)
        if md is None and isinstance(item, dict):
            md = item.get("metadata", {}) or {}
        if md is None:
            md = {}
        source_docs.append({"source": md.get("source", "unknown"), "page": _resolve_page(md)})

    # Post-process sources & confidence
    def _fmt_sources(sl):
        s, seen = [], set()
        for sd in sl:
            src, page = sd.get("source", "unknown"), sd.get("page")
            key = f"{src}|{page}"
            if key in seen:
                continue
            seen.add(key)
            s.append(f"{src} (page {page})" if page else src)
            if len(s) >= 3:
                break
        return s

    text_sources = _fmt_sources(source_docs)
    if "Sources Referenced: None" in answer and text_sources:
        answer = answer.replace("Sources Referenced: None", "Sources Referenced:\n\n" + "\n".join(f"- {x}" for x in text_sources))
    if "Sources Referenced:" not in answer:
        answer += "\n\nSources Referenced:\n\n" + ("\n".join(f"- {x}" for x in text_sources) if text_sources else "- None")

    if "Confidence:" not in answer:
        answer += "\n\nConfidence: Medium"
        confidence = "Medium"
    else:
        m = re.search(r"Confidence:\s*(High|Medium|Low)", answer, re.IGNORECASE)
        confidence = m.group(1).capitalize() if m else "Medium"

    # Save to DB and memory
    if convo_id:
        try:
            meta = {"sources": source_docs[:3], "confidence": confidence, "task_type": task_type}
            _save_message(db, convo_id, "user", req.query)
            _save_message(db, convo_id, "assistant", answer, meta)
            memory.append(convo_id, "user", req.query)
            memory.append(convo_id, "assistant", answer)
            # Touch conversation updated_at
            convo = db.query(Conversation).filter(Conversation.id == convo_id).first()
            if convo:
                convo.updated_at = datetime.utcnow()
                db.commit()
        except Exception:
            logger.exception("Failed to save to memory/DB")

    return {
        "task_type": task_type,
        "answer": answer.strip(),
        "sources": source_docs,
        "confidence": confidence,
        "context_count": len(chunks),
        "history_length": len(formatted_history.splitlines()),
    }
